'use client';

import { useState, useCallback, useEffect, useTransition, useRef, Suspense } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Users, Mail, Shield, Building2 } from 'lucide-react';
import { useAuthStore, User } from '@/lib/auth-store';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { useTranslation } from '@/lib/use-translation';

type InvitationInfo = {
  companyName: string;
  role: string;
  email: string;
};

type AcceptState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'unauthenticated'; invitation: InvitationInfo }
  | { phase: 'accepting'; invitation: InvitationInfo }
  | { phase: 'accepted'; invitation: InvitationInfo }
  | { phase: 'already_member'; invitation: InvitationInfo }
  | { phase: 'accept_failed'; invitation: InvitationInfo; message: string };

const ROLE_LABELS_DA: Record<string, string> = {
  OWNER: 'Ejer',
  ADMIN: 'Administrator',
  ACCOUNTANT: 'Bogholder',
  VIEWER: 'Læser',
  AUDITOR: 'Revisor',
};

function roleLabel(role: string, lang: 'da' | 'en'): string {
  if (lang === 'da') return ROLE_LABELS_DA[role] || role;
  return role;
}

function AcceptInvitationInner({ token }: { token: string }) {
  const { user, setUser, checkAuth } = useAuthStore();
  const [state, setState] = useState<AcceptState>({ phase: 'loading' });
  const [isPending, startTransition] = useTransition();
  const { t, language } = useTranslation();
  const lang = language === 'da' ? 'da' : 'en';

  // Verify the invitation token
  useEffect(() => {
    if (!token) {
      startTransition(() => setState({ phase: 'error', message: lang === 'da' ? 'Ugyldigt invitationslink.' : 'Invalid invitation link.' }));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/invitations/verify?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        const data = await response.json();

        if (data.valid) {
          const invitation: InvitationInfo = {
            companyName: data.invitation.companyName,
            role: data.invitation.role,
            email: data.invitation.email,
          };
          startTransition(() => setState({ phase: 'unauthenticated', invitation }));
        } else {
          startTransition(() => setState({ phase: 'error', message: data.error || (lang === 'da' ? 'Kunne ikke finde invitationen.' : 'Could not find the invitation.') }));
        }
      } catch {
        if (cancelled) return;
        startTransition(() => setState({ phase: 'error', message: lang === 'da' ? 'Der opstod en fejl.' : 'An error occurred.' }));
      }
    })();

    return () => { cancelled = true; };
  }, [token, lang, startTransition]);

  // Stable ref so we always have the latest invitation data without putting
  // `state.invitation` in the dependency array (it doesn't exist on all phases).
  const invitationRef = useRef<InvitationInfo | null>(null);

  // Auto-accept when the user becomes authenticated and we have an unauthenticated invitation
  useEffect(() => {
    if (state.phase === 'loading' || state.phase === 'error') {
      invitationRef.current = null;
      return;
    }
    invitationRef.current = state.invitation;

    if (user && state.phase === 'unauthenticated') {
      startTransition(() => setState({ phase: 'accepting', invitation: state.invitation }));
    }
  }, [user, state, startTransition]);

  // Actually accept the invitation
  useEffect(() => {
    if (state.phase !== 'accepting') return;
    const inv = invitationRef.current;
    if (!inv) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        const data = await response.json();

        if (response.ok) {
          startTransition(() => {
            if (data.message?.includes('Already')) {
              setState({ phase: 'already_member', invitation: inv });
            } else {
              setState({ phase: 'accepted', invitation: inv });
            }
          });
          // Refresh auth state to pick up the new company membership
          await checkAuth();
        } else {
          startTransition(() => setState({ phase: 'accept_failed', invitation: inv, message: data.error || (lang === 'da' ? 'Kunne ikke acceptere invitationen.' : 'Could not accept the invitation.') }));
        }
      } catch {
        if (cancelled) return;
        startTransition(() => setState({ phase: 'accept_failed', invitation: inv, message: lang === 'da' ? 'Der opstod en fejl.' : 'An error occurred.' }));
      }
    })();

    return () => { cancelled = true; };
  }, [state.phase, token, lang, startTransition, checkAuth]);

  const handleGoToApp = () => {
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    // The useEffect above will detect user becoming truthy and auto-accept
  }, [setUser]);

  // ─── Loading ───
  if (state.phase === 'loading') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8faf9]">
        <Loader2 className="h-8 w-8 text-[#0d9488] animate-spin" />
      </div>
    );
  }

  // ─── Error ───
  if (state.phase === 'error') {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            <div className="mb-[46px] -mt-[19px]">
              <Image src="/logo-clean.png" alt="AlphaFlow" width={170} height={114} className="object-contain" priority />
            </div>
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />
            <div className="w-full relative">
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-8 border border-white/60 login-card-animated-bg login-card-glow">
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                    <XCircle className="h-9 w-9 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'Invitationen kunne ikke findes' : 'Invitation not found'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{state.message}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={handleGoToApp} className="w-full h-11 font-medium text-sm mt-2">
                    {lang === 'da' ? 'Tilbage til login' : 'Back to login'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { invitation } = state;

  // ─── Unauthenticated — show invitation details + login/register ───
  if (state.phase === 'unauthenticated') {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            <div className="mb-[46px] -mt-[19px]">
              <Image src="/logo-clean.png" alt="AlphaFlow" width={170} height={114} className="object-contain" priority />
            </div>
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />

            {/* Invitation banner */}
            <div className="w-full mb-6 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/40 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-[#0d9488]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {lang === 'da' ? 'Du er inviteret!' : 'You\'re invited!'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {lang === 'da'
                      ? <>Du er blevet inviteret til <strong>{invitation.companyName}</strong> som <strong>{roleLabel(invitation.role, lang)}</strong>. Log ind eller opret en konto for at acceptere.</>
                      : <>You&apos;ve been invited to join <strong>{invitation.companyName}</strong> as <strong>{roleLabel(invitation.role, lang)}</strong>. Sign in or create an account to accept.</>}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full relative">
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-6 border border-white/60 login-card-animated-bg login-card-glow">
                <InvitationAuthFlow
                  invitation={invitation}
                  onLoginSuccess={handleLoginSuccess}
                  lang={lang}
                />
              </div>
            </div>
          </div>
        </main>
        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by</span>
            <span className="text-[#0d9488] font-semibold">AlphaFlow</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {lang === 'da' ? 'Bogføringsapp' : 'Accounting'}
          </p>
        </footer>
      </div>
    );
  }

  // ─── Accepting (spinner) ───
  if (state.phase === 'accepting') {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            <div className="mb-[46px] -mt-[19px]">
              <Image src="/logo-clean.png" alt="AlphaFlow" width={170} height={114} className="object-contain" priority />
            </div>
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="w-full relative">
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-8 border border-white/60 login-card-animated-bg login-card-glow">
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="relative h-14 w-14">
                    <div className="absolute inset-0 rounded-full animate-spin" style={{ background: 'conic-gradient(from 0deg, #0d9488, #2dd4bf, #0d9488)', animationDuration: '1.5s' }} />
                    <div className="absolute inset-1.5 rounded-full bg-white" />
                    <Loader2 className="absolute inset-0 m-auto h-6 w-6 text-[#0d9488] animate-spin" style={{ animationDuration: '2s' }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'Accepterer invitation...' : 'Accepting invitation...'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {lang === 'da' ? 'Et øjeblik.' : 'One moment.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Accepted / Already member — Welcome screen ───
  if (state.phase === 'accepted' || state.phase === 'already_member') {
    const isAlreadyMember = state.phase === 'already_member';
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            <div className="mb-[46px] -mt-[19px]">
              <Image src="/logo-clean.png" alt="AlphaFlow" width={170} height={114} className="object-contain" priority />
            </div>
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />

            <div className="w-full relative">
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-8 border border-white/60 login-card-animated-bg login-card-glow">
                <div className="flex flex-col items-center text-center space-y-4 py-2">
                  {/* Success icon */}
                  <div className="h-16 w-16 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
                    <CheckCircle2 className="h-9 w-9 text-[#0d9488]" />
                  </div>

                  {/* Welcome heading */}
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'Velkommen til AlphaFlow!' : 'Welcome to AlphaFlow!'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                      {isAlreadyMember
                        ? (lang === 'da'
                          ? <>Du er allerede tilknyttet <strong>{invitation.companyName}</strong>.</>
                          : <>You are already a member of <strong>{invitation.companyName}</strong>.</>)
                        : (lang === 'da'
                          ? <>Du er nu tilknyttet <strong>{invitation.companyName}</strong> som <strong>{roleLabel(invitation.role, lang)}</strong>.</>
                          : <>You are now a member of <strong>{invitation.companyName}</strong> as <strong>{roleLabel(invitation.role, lang)}</strong>.</>)}
                    </p>
                  </div>

                  {/* Info card */}
                  <div className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-[#0d9488]" />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{lang === 'da' ? 'Virksomhed' : 'Company'}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{invitation.companyName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                        <Shield className="h-4 w-4 text-[#0d9488]" />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{lang === 'da' ? 'Rolle' : 'Role'}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{roleLabel(invitation.role, lang)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4 text-[#0d9488]" />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{lang === 'da' ? 'E-mail' : 'Email'}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{invitation.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tagline */}
                  <p className="text-sm font-medium text-[#0d9488]">
                    {lang === 'da' ? 'God arbejdslyst! 🎉' : 'Welcome aboard! 🎉'}
                  </p>

                  <Button
                    type="button"
                    onClick={handleGoToApp}
                    className="w-full h-11 btn-primary text-white font-medium text-sm"
                  >
                    {lang === 'da' ? 'Gå til AlphaFlow' : 'Go to AlphaFlow'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by</span>
            <span className="text-[#0d9488] font-semibold">AlphaFlow</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {lang === 'da' ? 'Bogføringsapp' : 'Accounting'}
          </p>
        </footer>
      </div>
    );
  }

  // ─── Accept failed ───
  if (state.phase === 'accept_failed') {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            <div className="mb-[46px] -mt-[19px]">
              <Image src="/logo-clean.png" alt="AlphaFlow" width={170} height={114} className="object-contain" priority />
            </div>
            <div className="w-full relative">
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-8 border border-white/60 login-card-animated-bg login-card-glow">
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-16 w-16 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                    <XCircle className="h-9 w-9 text-amber-500 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'Kunne ikke acceptere' : 'Could not accept'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{state.message}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={handleGoToApp} className="w-full h-11 font-medium text-sm mt-2">
                    {lang === 'da' ? 'Tilbage' : 'Back'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}

// ─── Inline login/register flow for unauthenticated invitees ───
function InvitationAuthFlow({ invitation, onLoginSuccess, lang }: {
  invitation: InvitationInfo;
  onLoginSuccess: (user: User) => void;
  lang: 'da' | 'en';
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return mode === 'login' ? (
    <LoginForm
      onSuccess={onLoginSuccess}
      onSwitchToRegister={() => setMode('register')}
    />
  ) : (
    <RegisterForm
      onSuccess={() => {
        // After registration, the user must verify their email first.
        // The invitation will still be waiting when they return.
      }}
      onSwitchToLogin={() => setMode('login')}
    />
  );
}

export function AcceptInvitationScreen({ token }: { token: string }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8faf9]">
          <Loader2 className="h-8 w-8 text-[#0d9488] animate-spin" />
        </div>
      }
    >
      <AcceptInvitationInner token={token} />
    </Suspense>
  );
}
