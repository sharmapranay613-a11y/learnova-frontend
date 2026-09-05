'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  ClipboardCheck,
  BrainCircuit,
  CalendarClock,
  Sparkles,
  LineChart,
  Menu,
  X,
  GraduationCap,
  CalendarDays,
  LogOut,
  Mail,
  BookOpen,
  GraduationCap as CourseIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/diagnostic', label: 'Diagnostic Test', icon: ClipboardCheck },
  { href: '/analysis', label: 'AI Analysis', icon: BrainCircuit },
  { href: '/study-plan', label: 'Study Plan', icon: CalendarClock },
  { href: '/tutor', label: 'AI Tutor', icon: Sparkles },
  { href: '/progress', label: 'Progress', icon: LineChart },
]

type Profile = {
  full_name: string | null
  email: string | null
  course: string | null
  semester: string | null
}

type Subject = {
  id: string
  name: string
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  const [profile, setProfile] = useState<Profile>({
    full_name: null,
    email: null,
    course: null,
    semester: null,
  })

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    async function checkAuthAndLoadProfile() {
      setAuthChecked(false)

      // Login and signup are public pages
      if (pathname === '/login' || pathname === '/signup') {
        setLoadingProfile(false)
        setAuthChecked(true)
        return
      }

      // Check logged-in user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Not logged in → login
      if (!user) {
        router.replace('/login')
        return
      }

      // Setup is accessible only after login
      // It has its own UI, so AppShell won't render around it.
      if (pathname === '/setup') {
        setLoadingProfile(false)
        setAuthChecked(true)
        return
      }

      setLoadingProfile(true)

      // Load profile from Supabase
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, email, course, semester')
        .eq('id', user.id)
        .maybeSingle()

      // Load subjects from Supabase
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      setProfile({
        full_name:
          profileData?.full_name ||
          user.user_metadata?.full_name ||
          user.email?.split('@')[0] ||
          'Student',

        email: profileData?.email || user.email || '',

        course: profileData?.course || null,

        semester: profileData?.semester || null,
      })

      setSubjects(subjectsData || [])

      setLoadingProfile(false)
      setAuthChecked(true)
    }

    checkAuthAndLoadProfile()
  }, [pathname, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()

    setProfileOpen(false)
    router.replace('/login')
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const NavList = () => (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = isActive(item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              active
                ? 'bg-gradient-to-r from-violet/25 to-blue/15 text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'size-[18px] shrink-0 transition-colors',
                active
                  ? 'text-violet'
                  : 'text-muted-foreground group-hover:text-foreground',
              )}
            />

            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const Brand = () => (
    <Link
      href="/"
      className="flex items-center gap-2.5"
      onClick={() => setOpen(false)}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet via-blue to-cyan text-primary-foreground shadow-lg shadow-violet/30">
        <GraduationCap className="size-5" />
      </span>

      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          LEARNOVA <span className="text-violet">AI</span>
        </span>

        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Your Learning. Your Pace.
        </span>
      </span>
    </Link>
  )

  // Login / Signup pages should NOT have sidebar
  if (pathname === '/login' || pathname === '/signup') {
    return <>{children}</>
  }

  // Setup page should NOT have sidebar
  if (pathname === '/setup') {
    if (!authChecked) {
      return null
    }

    return <>{children}</>
  }

  // Wait until authentication has been checked
  if (!authChecked) {
    return null
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
        <div className="px-2 pt-2">
          <Brand />
        </div>

        <div className="px-1">
          <NavList />
        </div>

        <StudentCard
          className="mt-auto"
          profile={profile}
          subjects={subjects}
          loading={loadingProfile}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <aside className="glass-strong absolute left-0 top-0 flex h-full w-72 flex-col gap-6 border-r p-4">
            <div className="flex items-center justify-between px-1 pt-1">
              <Brand />

              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <NavList />

            <StudentCard
              className="mt-auto"
              profile={profile}
              subjects={subjects}
              loading={loadingProfile}
              profileOpen={profileOpen}
              setProfileOpen={setProfileOpen}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-40 flex items-center justify-between gap-4 border-b px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <div className="lg:hidden">
              <Brand />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
            <CalendarDays className="size-3.5" />
            Exam in 15 days
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

function StudentCard({
  className,
  profile,
  subjects,
  loading,
  profileOpen,
  setProfileOpen,
  onLogout,
}: {
  className?: string
  profile: Profile
  subjects: Subject[]
  loading: boolean
  profileOpen: boolean
  setProfileOpen: (value: boolean) => void
  onLogout: () => void
}) {
  const userName = profile.full_name || 'Student'

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className={cn('relative', className)}>
      {/* Profile popup */}
      {profileOpen && (
        <div className="absolute bottom-full left-0 mb-3 w-64 rounded-2xl border bg-background/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-blue text-sm font-semibold text-primary-foreground">
              {initials || 'ST'}
            </span>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {userName}
              </p>

              <p className="truncate text-xs text-muted-foreground">
                {profile.email || 'No email'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t pt-3">
            {/* Email */}
            <div className="flex gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-violet" />

              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Email
                </p>

                <p className="break-all text-xs text-foreground">
                  {profile.email || 'Not available'}
                </p>
              </div>
            </div>

            {/* Course */}
            <div className="flex gap-3">
              <CourseIcon className="mt-0.5 size-4 shrink-0 text-violet" />

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Course
                </p>

                <p className="text-xs text-foreground">
                  {profile.course || 'Not added'}
                </p>
              </div>
            </div>

            {/* Semester */}
            <div className="flex gap-3">
              <GraduationCap className="mt-0.5 size-4 shrink-0 text-violet" />

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Semester
                </p>

                <p className="text-xs text-foreground">
                  {profile.semester || 'Not added'}
                </p>
              </div>
            </div>

            {/* Subjects */}
            <div className="flex gap-3">
              <BookOpen className="mt-0.5 size-4 shrink-0 text-violet" />

              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Subjects
                </p>

                {subjects.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {subjects.map((subject) => (
                      <span
                        key={subject.id}
                        className="rounded-md bg-violet/10 px-2 py-1 text-[11px] text-violet"
                      >
                        {subject.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No subjects added
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      )}

      {/* Clickable student card */}
      <button
        type="button"
        onClick={() => setProfileOpen(!profileOpen)}
        className="glass-strong flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:border-violet/40 hover:bg-violet/5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-blue text-sm font-semibold text-primary-foreground">
          {loading ? '...' : initials || 'ST'}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {loading ? 'Loading...' : userName}
          </p>

          <p className="truncate text-xs text-muted-foreground">
            {loading ? 'Please wait...' : profile.email}
          </p>
        </div>
      </button>
    </div>
  )
}