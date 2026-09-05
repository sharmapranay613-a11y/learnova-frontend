'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Send,
  RotateCcw,
  ArrowRight,
  Loader2,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MasteryRing } from '@/components/mastery-ring'

import {
  calculateScore,
  classifyMastery,
} from '@/lib/adaptiveEngine'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type AIQuestion = {
  id: number
  subject: string
  topic: string
  difficulty: string
  prompt: string
  options: string[]
  correctIndex: number
}

type TopicResult = {
  subject: string
  topic: string
  correct: number
  total: number
  score: number
  mistakes: number
}

type ConfidenceLevel = 25 | 50 | 75 | 100

type StudentSubject = {
  id: string
  name: string
}

type StudentTopic = {
  id: string
  subject_id: string
  name: string
}

export function DiagnosticTest() {
  const [questions, setQuestions] = useState<AIQuestion[]>([])
  const [current, setCurrent] = useState(0)

  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [confidences, setConfidences] = useState<
    Record<number, ConfidenceLevel>
  >({})

  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(true)

  const [topicResults, setTopicResults] = useState<TopicResult[]>([])
  const [generationError, setGenerationError] = useState('')

  /*
   * --------------------------------------------------
   * Generate AI questions
   * --------------------------------------------------
   */

  useEffect(() => {
    generateAIQuestions()
  }, [])

  const generateAIQuestions = async () => {
    setIsGenerating(true)
    setGenerationError('')

    try {
      /*
       * 1. Get logged-in student
       */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error(
          'Please log in before starting the diagnostic test.'
        )
      }

      /*
       * 2. Get student's subjects
       */

      const {
        data: subjects,
        error: subjectsError,
      } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (subjectsError) {
        throw subjectsError
      }

      if (!subjects || subjects.length === 0) {
        throw new Error(
          'No subjects found. Please complete your student setup first.'
        )
      }

      /*
       * 3. Get student's topics
       */

      const subjectIds = subjects.map(
        (subject) => subject.id
      )

      const {
        data: topics,
        error: topicsError,
      } = await supabase
        .from('topics')
        .select('id, subject_id, name')
        .in('subject_id', subjectIds)
        .order('created_at', { ascending: true })

      if (topicsError) {
        throw topicsError
      }

      const studentSubjects: StudentSubject[] = subjects
      const studentTopics: StudentTopic[] = topics || []

      /*
       * --------------------------------------------------
       * IMPORTANT:
       *
       * Generate the complete diagnostic in ONE Gemini
       * request instead of making one request per subject.
       *
       * This reduces the chance of Gemini 429 quota errors.
       * --------------------------------------------------
       */

      const primarySubject = studentSubjects[0]

      const subjectTopics = studentTopics.filter(
        (topic) =>
          topic.subject_id === primarySubject.id
      )

      const primaryTopic =
        subjectTopics.length > 0
          ? subjectTopics[0].name
          : primarySubject.name

      console.log(
        'Generating 10 AI questions for:',
        primarySubject.name,
        '| Topic:',
        primaryTopic
      )

      /*
       * 4. Call backend ONCE
       */

      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL

      if (!apiUrl) {
        throw new Error(
          'NEXT_PUBLIC_API_URL is not configured.'
        )
      }

      const response = await fetch(
        `${apiUrl}/api/ai/generate-questions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: primarySubject.name,
            topic: primaryTopic,
            difficulty: 'mixed',
            count: 10,
          }),
        }
      )

      /*
       * Read response safely
       */

      const result = await response.json().catch(
        () => null
      )

      if (!response.ok) {
        console.error(
          'AI question generation failed:',
          result
        )

        const backendError =
          result?.error ||
          `Backend returned status ${response.status}.`

        throw new Error(backendError)
      }

      /*
       * Backend returns:
       *
       * {
       *   success: true,
       *   data: {
       *     questions: [...]
       *   }
       * }
       */

      const backendQuestions =
        result?.data?.questions ||
        result?.questions ||
        []

      if (
        !Array.isArray(backendQuestions) ||
        backendQuestions.length === 0
      ) {
        throw new Error(
          'Gemini returned no questions. Please try again.'
        )
      }

      /*
       * 5. Convert backend questions into
       * frontend question format.
       */

      const generatedQuestions: AIQuestion[] = []

      backendQuestions.forEach(
        (question: any, index: number) => {
          const options = Array.isArray(
            question.options
          )
            ? question.options
            : []

          /*
           * We require at least 4 options because
           * this is a multiple-choice diagnostic.
           */

          if (options.length < 4) {
            console.warn(
              'Skipping question with insufficient options:',
              question
            )

            return
          }

          /*
           * Find correct answer index.
           *
           * Backend normally returns:
           *
           * correctAnswer: "exact option text"
           */

          let correctIndex = Number.isInteger(
            question.correctIndex
          )
            ? question.correctIndex
            : -1

          if (
            correctIndex < 0 &&
            question.correctAnswer
          ) {
            const correctAnswer = String(
              question.correctAnswer
            ).trim()

            /*
             * First try exact option match.
             */

            const foundIndex =
              options.findIndex(
                (option: string) =>
                  String(option)
                    .trim()
                    .toLowerCase() ===
                  correctAnswer.toLowerCase()
              )

            if (foundIndex >= 0) {
              correctIndex = foundIndex
            } else {
              /*
               * Also support A/B/C/D answers.
               */

              const answerLetter =
                correctAnswer
                  .toUpperCase()

              if (
                /^[A-D]$/.test(
                  answerLetter
                )
              ) {
                correctIndex =
                  answerLetter.charCodeAt(0) -
                  65
              }
            }
          }

          /*
           * Validate correct answer index.
           */

          if (
            correctIndex < 0 ||
            correctIndex >= options.length
          ) {
            console.warn(
              'Skipping question with invalid correct answer:',
              question
            )

            return
          }

          /*
           * Question text can come from:
           *
           * question
           * prompt
           * text
           */

          const prompt =
            question.question ||
            question.prompt ||
            question.text ||
            ''

          if (!prompt) {
            return
          }

          generatedQuestions.push({
            id: index,

            subject:
              question.subject ||
              primarySubject.name,

            topic:
              question.topic ||
              primaryTopic,

            difficulty:
              question.difficulty ||
              'Mixed',

            prompt,

            options,

            correctIndex,
          })
        }
      )

      /*
       * 6. Make sure enough questions were generated.
       */

      if (generatedQuestions.length === 0) {
        throw new Error(
          'AI generated questions, but none had a valid format. Please try again.'
        )
      }

      /*
       * Use maximum 10 questions.
       */

      const finalQuestions =
        generatedQuestions
          .slice(0, 10)
          .map(
            (question, index) => ({
              ...question,
              id: index,
            })
          )

      console.log(
        `Successfully generated ${finalQuestions.length} questions.`
      )

      setQuestions(finalQuestions)
      setCurrent(0)
      setAnswers({})
      setConfidences({})
      setSubmitted(false)
    } catch (error) {
      console.error(
        'AI question generation error:',
        error
      )

      setGenerationError(
        error instanceof Error
          ? error.message
          : 'Unable to generate AI questions.'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  /*
   * --------------------------------------------------
   * Loading state
   * --------------------------------------------------
   */

  if (isGenerating) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <Card className="glass-strong w-full max-w-md p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-violet/10">
              <Loader2 className="size-7 animate-spin text-violet" />
            </div>

            <div>
              <h2 className="text-lg font-semibold">
                Generating your AI diagnostic
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Learnova is creating 10 questions
                based on your subjects and topics.
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  /*
   * --------------------------------------------------
   * Generation error
   * --------------------------------------------------
   */

  if (generationError) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <Card className="glass-strong w-full max-w-lg p-8 text-center">
          <div className="space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-warning/10">
              <Circle className="size-7 text-warning" />
            </div>

            <div>
              <h2 className="text-lg font-semibold">
                Unable to generate questions
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                {generationError}
              </p>
            </div>

            <Button
              onClick={generateAIQuestions}
            >
              <RotateCcw className="size-4" />
              Try again
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  /*
   * --------------------------------------------------
   * Safety check
   * --------------------------------------------------
   */

  if (questions.length === 0) {
    return (
      <Card className="glass-strong p-8 text-center">
        <h2 className="text-lg font-semibold">
          No questions available
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Please try generating the diagnostic again.
        </p>

        <Button
          className="mt-4"
          onClick={generateAIQuestions}
        >
          Generate Questions
        </Button>
      </Card>
    )
  }

  const q = questions[current]

  const total = questions.length

  const answeredCount =
    Object.keys(answers).length

  const progress =
    total > 0
      ? Math.round(
          ((current + 1) / total) * 100
        )
      : 0

  /*
   * --------------------------------------------------
   * Overall score
   * --------------------------------------------------
   */

  const correct = questions.filter(
    (question) =>
      answers[question.id] ===
      question.correctIndex
  ).length

  const score = calculateScore(
    correct,
    total
  )

  const band = classifyMastery(score)

  /*
   * --------------------------------------------------
   * Select answer
   * --------------------------------------------------
   */

  const select = (optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [q.id]: optionIndex,
    }))
  }

  /*
   * --------------------------------------------------
   * Select confidence
   * --------------------------------------------------
   */

  const selectConfidence = (
    confidence: ConfidenceLevel
  ) => {
    setConfidences((prev) => ({
      ...prev,
      [q.id]: confidence,
    }))
  }

  /*
   * --------------------------------------------------
   * Normalize
   * --------------------------------------------------
   */

  const normalize = (value: string) =>
    value.trim().toLowerCase()

  /*
   * --------------------------------------------------
   * Calculate topic results
   * --------------------------------------------------
   */

  const calculateTopicResults =
    (): TopicResult[] => {
      const topicMap = new Map<
        string,
        {
          subject: string
          topic: string
          correct: number
          total: number
        }
      >()

      questions.forEach((question) => {
        const key = `${normalize(
          question.subject
        )}::${normalize(question.topic)}`

        const existing = topicMap.get(key)

        const isCorrect =
          answers[question.id] ===
          question.correctIndex

        if (existing) {
          existing.total += 1

          if (isCorrect) {
            existing.correct += 1
          }
        } else {
          topicMap.set(key, {
            subject: question.subject,
            topic: question.topic,
            correct: isCorrect ? 1 : 0,
            total: 1,
          })
        }
      })

      return Array.from(
        topicMap.values()
      ).map((item) => ({
        subject: item.subject,
        topic: item.topic,
        correct: item.correct,
        total: item.total,
        score: calculateScore(
          item.correct,
          item.total
        ),
        mistakes:
          item.total - item.correct,
      }))
    }

  /*
   * --------------------------------------------------
   * Submit diagnostic
   * --------------------------------------------------
   */

  const submitTest = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      /*
       * 1. Get logged-in user
       */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error(
          'Failed to get user:',
          userError
        )

        alert(
          'Unable to verify your login. Please log in again.'
        )

        return
      }

      if (!user) {
        alert(
          'Please log in before submitting the test.'
        )

        return
      }

      /*
       * 2. Calculate topic results
       */

      const calculatedTopicResults =
        calculateTopicResults()

      /*
       * 3. Save overall attempt
       */

      const {
        data: attempt,
        error: diagnosticError,
      } = await supabase
        .from('diagnostic_attempts')
        .insert({
          user_id: user.id,
          score,
          correct_answers: correct,
          total_questions: total,
        })
        .select('id')
        .single()

      if (diagnosticError) {
        console.error(
          'Failed to save diagnostic attempt:',
          diagnosticError
        )

        alert(
          'Could not save your test result. Please try again.'
        )

        return
      }

      if (!attempt) {
        alert(
          'Diagnostic attempt was saved, but its ID could not be retrieved.'
        )

        return
      }

      /*
       * 4. Save individual answers
       */

      const answerRows =
        questions.map((question) => {
          const selectedAnswer =
            answers[question.id]

          const isCorrect =
            selectedAnswer ===
            question.correctIndex

          return {
            attempt_id: attempt.id,
            user_id: user.id,

            subject: question.subject,

            topic: question.topic,

            question_text:
              question.prompt,

            selected_answer:
              selectedAnswer,

            correct_answer:
              question.correctIndex,

            is_correct: isCorrect,

            confidence:
              confidences[question.id] ?? 0,

            mistake_type: null,
          }
        })

      const {
        error: answersError,
      } = await supabase
        .from('diagnostic_answers')
        .insert(answerRows)

      if (answersError) {
        console.error(
          'Failed to save diagnostic answers:',
          answersError
        )

        alert(
          'Your score was saved, but individual answers could not be saved.'
        )
      }

      /*
       * 5. Get user's subjects
       */

      const {
        data: subjects,
        error: subjectsError,
      } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('user_id', user.id)

      if (subjectsError) {
        console.error(
          'Failed to load subjects:',
          subjectsError
        )

        setTopicResults(
          calculatedTopicResults
        )

        setSubmitted(true)

        return
      }

      /*
       * 6. Update matching topics
       */

      for (const result of calculatedTopicResults) {
        const matchingSubject =
          (subjects ?? []).find(
            (subject) =>
              normalize(subject.name) ===
              normalize(result.subject)
          )

        if (!matchingSubject) {
          continue
        }

        const {
          data: matchingTopics,
          error: topicLookupError,
        } = await supabase
          .from('topics')
          .select(
            'id, name, score, confidence, recent_mistakes'
          )
          .eq(
            'subject_id',
            matchingSubject.id
          )

        if (topicLookupError) {
          console.error(
            `Failed to load topics for ${result.subject}:`,
            topicLookupError
          )

          continue
        }

        const matchingTopic =
          (matchingTopics ?? []).find(
            (topic) =>
              normalize(topic.name) ===
              normalize(result.topic)
          )

        if (!matchingTopic) {
          continue
        }

        /*
         * Calculate average confidence
         */

        const topicQuestions =
          questions.filter(
            (question) =>
              normalize(
                question.subject
              ) ===
                normalize(
                  result.subject
                ) &&
              normalize(
                question.topic
              ) ===
                normalize(result.topic)
          )

        const topicConfidenceValues =
          topicQuestions
            .map(
              (question) =>
                confidences[
                  question.id
                ]
            )
            .filter(
              (
                value
              ): value is ConfidenceLevel =>
                value !== undefined
            )

        const averageConfidence =
          topicConfidenceValues.length >
          0
            ? Math.round(
                topicConfidenceValues.reduce(
                  (sum, value) =>
                    sum + value,
                  0
                ) /
                  topicConfidenceValues.length
              )
            : 0

        /*
         * Update topic
         */

        const {
          error: updateError,
        } = await supabase
          .from('topics')
          .update({
            score: result.score,
            confidence:
              averageConfidence,
            recent_mistakes:
              result.mistakes,
          })
          .eq(
            'id',
            matchingTopic.id
          )

        if (updateError) {
          console.error(
            `Failed to update topic "${result.topic}":`,
            updateError
          )
        }
      }

      /*
       * 7. Show result
       */

      setTopicResults(
        calculatedTopicResults
      )

      setSubmitted(true)
    } catch (error) {
      console.error(
        'Unexpected error submitting diagnostic:',
        error
      )

      alert(
        'Something went wrong while submitting the test.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  /*
   * --------------------------------------------------
   * Reset
   * --------------------------------------------------
   */

  const reset = () => {
    setAnswers({})
    setConfidences({})
    setCurrent(0)
    setSubmitted(false)
    setTopicResults([])

    /*
     * Generate a fresh AI diagnostic when
     * the student retakes the test.
     */

    generateAIQuestions()
  }

  /*
   * ==================================================
   * RESULT SCREEN
   * ==================================================
   */

  if (submitted) {
    const weakestTopic =
      topicResults.length > 0
        ? [...topicResults].sort(
            (a, b) =>
              a.score - b.score
          )[0]
        : null

    return (
      <div className="space-y-6">

        <Card className="glass-strong flex flex-col items-center gap-5 p-8 text-center">
          <MasteryRing
            value={score}
            label={band}
            sublabel="Score band"
          />

          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              Diagnostic Complete — Score {score}%
            </h2>

            <p className="text-sm text-muted-foreground">
              {correct} of {total} correct.
              Your performance has been
              analyzed at the topic level.
            </p>
          </div>

          <Badge
            className={
              band === 'Weak'
                ? 'bg-warning/15 text-warning shadow-none'
                : band === 'Average'
                  ? 'bg-blue/15 text-blue shadow-none'
                  : 'bg-success/15 text-success shadow-none'
            }
          >
            {band}

            {band === 'Weak'
              ? ' — needs attention'
              : band === 'Average'
                ? ' — keep practicing'
                : ' — strong performance'}
          </Badge>
        </Card>

        <Card className="glass p-6">
          <h3 className="text-base font-semibold">
            Topic mastery
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Your measured performance for each
            topic in this diagnostic.
          </p>

          <div className="mt-5 space-y-4">
            {topicResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No topic-level results were
                calculated.
              </p>
            ) : (
              topicResults.map((topic) => (
                <div
                  key={`${topic.subject}-${topic.topic}`}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {topic.topic}

                      <span className="ml-1 text-xs text-muted-foreground">
                        · {topic.subject}
                      </span>
                    </span>

                    <span className="font-semibold">
                      {topic.score}%
                    </span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        topic.score < 50
                          ? 'bg-warning'
                          : topic.score <= 75
                            ? 'bg-blue'
                            : 'bg-success'
                      )}
                      style={{
                        width: `${topic.score}%`,
                      }}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {topic.correct}/
                    {topic.total} correct
                    {topic.mistakes > 0
                      ? ` · ${topic.mistakes} mistake${
                          topic.mistakes > 1
                            ? 's'
                            : ''
                        }`
                      : ' · No mistakes'}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

        {weakestTopic && (
          <Card className="glass border-warning/20 p-6">
            <h3 className="text-base font-semibold">
              Priority topic
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Learnova will prioritize this area
              in your adaptive learning plan.
            </p>

            <div className="mt-4 rounded-xl bg-warning/10 p-4">
              <p className="font-semibold">
                {weakestTopic.topic}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {weakestTopic.subject} ·{' '}
                {weakestTopic.score}% mastery ·{' '}
                {weakestTopic.mistakes} mistake
                {weakestTopic.mistakes !== 1
                  ? 's'
                  : ''}
              </p>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            nativeButton={false}
            render={<Link href="/analysis" />}
          >
            See AI analysis
            <ArrowRight className="size-4" />
          </Button>

          <Button
            variant="outline"
            onClick={reset}
            disabled={isGenerating}
          >
            <RotateCcw className="size-4" />
            Retake test
          </Button>
        </div>
      </div>
    )
  }

  /*
   * ==================================================
   * QUESTION SCREEN
   * ==================================================
   */

  const selectedConfidence =
    confidences[q.id]

  const hasAnswer =
    answers[q.id] !== undefined

  return (
    <div className="space-y-6">

      {/* Progress */}

      <Card className="glass p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Question {current + 1} of {total}
          </span>

          <span className="font-medium text-violet">
            {answeredCount}/{total} answered
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet to-blue transition-all duration-500"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </Card>

      {/* Question */}

      <Card className="glass-strong p-6 sm:p-8">

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="shadow-none"
          >
            {q.subject}
          </Badge>

          <Badge
            variant="secondary"
            className="shadow-none"
          >
            {q.topic}
          </Badge>

          <Badge className="bg-cyan/15 text-cyan shadow-none">
            {q.difficulty}
          </Badge>
        </div>

        <h2 className="mt-4 text-lg font-medium leading-relaxed text-balance">
          {q.prompt}
        </h2>

        {/* Options */}

        <div className="mt-6 space-y-3">
          {q.options.map((opt, i) => {
            const selected =
              answers[q.id] === i

            return (
              <button
                key={i}
                type="button"
                onClick={() => select(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm transition-all',
                  selected
                    ? 'border-violet/50 bg-violet/10 text-foreground'
                    : 'border-border bg-background/40 text-foreground/90 hover:border-violet/30 hover:bg-background/70'
                )}
              >
                {selected ? (
                  <CheckCircle2 className="size-5 shrink-0 text-violet" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" />
                )}

                <span className="font-mono text-xs text-muted-foreground">
                  {String.fromCharCode(
                    65 + i
                  )}
                </span>

                {opt}
              </button>
            )
          })}
        </div>

        {/* Confidence */}

        <div className="mt-8 border-t pt-6">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">
              How confident are you in your answer?
            </h3>

            <p className="mt-1 text-xs text-muted-foreground">
              This helps Learnova compare your
              confidence with your actual
              performance.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                value: 25 as ConfidenceLevel,
                label: 'Guessing',
              },
              {
                value: 50 as ConfidenceLevel,
                label: 'Somewhat confident',
              },
              {
                value: 75 as ConfidenceLevel,
                label: 'Confident',
              },
              {
                value: 100 as ConfidenceLevel,
                label: 'Very confident',
              },
            ].map((level) => {
              const selected =
                selectedConfidence ===
                level.value

              return (
                <button
                  key={level.value}
                  type="button"
                  onClick={() =>
                    selectConfidence(
                      level.value
                    )
                  }
                  disabled={!hasAnswer}
                  className={cn(
                    'rounded-xl border p-3 text-center transition-all',
                    !hasAnswer &&
                      'cursor-not-allowed opacity-50',
                    selected
                      ? 'border-violet/50 bg-violet/10'
                      : 'border-border bg-background/40 hover:border-violet/30 hover:bg-background/70'
                  )}
                >
                  <div className="text-lg font-semibold">
                    {level.value}%
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {level.label}
                  </div>
                </button>
              )
            })}
          </div>

          {!hasAnswer && (
            <p className="mt-3 text-xs text-warning">
              Select an answer first.
            </p>
          )}
        </div>
      </Card>

      {/* Navigation */}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() =>
            setCurrent((c) =>
              Math.max(0, c - 1)
            )
          }
          disabled={
            current === 0 ||
            isSubmitting
          }
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>

        {current < total - 1 ? (
          <Button
            onClick={() =>
              setCurrent((c) =>
                Math.min(
                  total - 1,
                  c + 1
                )
              )
            }
            disabled={
              isSubmitting ||
              !hasAnswer ||
              !selectedConfidence
            }
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button
            onClick={submitTest}
            disabled={
              answeredCount < total ||
              Object.keys(confidences)
                .length < total ||
              isSubmitting
            }
          >
            <Send className="size-4" />

            {isSubmitting
              ? 'Saving...'
              : 'Submit test'}
          </Button>
        )}
      </div>
    </div>
  )
}