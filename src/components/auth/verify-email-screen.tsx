'use client';

import { useState, useEffect, useTransition, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

type VerifyState = 'verifying' | 'success' | 'error';

function VerifyEmailInner({ token }: { token: string }) {
  const [status, setStatus] = useState<VerifyState>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const { language } = useTranslation();
  const lang = language === 'da' ? 'da' : 'en';

  useEffect(() => {
    if (!token) {
      startTransition(() => {
        setStatus('error');
        setErrorMessage(lang === 'da' ? 'Ugyldigt verifikationslink.' : 'Invalid verification link.');
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        const data = await response.json();

        if (response.ok) {
          startTransition(() => setStatus('success'));
        } else {
          startTransition(() => {
            setStatus('error');
            setErrorMessage(
              data.error || (lang === 'da' ? 'Kunne ikke bekræfte e-mailen.' : 'Could not verify email.')
            );
          });
        }
      } catch {
        if (cancelled) return;
        startTransition(() => {
          setStatus('error');
          setErrorMessage(lang === 'da' ? 'Der opstod en fejl.' : 'An error occurred.');
        });
      }
    })();

    return () => { cancelled = true; };
  }, [token, lang, startTransition]);

  const handleGoToLogin = () => {
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
      <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
          {/* Logo */}
          <div className="mb-[46px] -mt-[19px]">
            <Image
              src="/logo-clean.png"
              alt="AlphaFlow"
              width={170}
              height={114}
              className="object-contain login-logo-hover"
              priority
            />
          </div>

          {/* Decorative shapes */}
          <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
          <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />

          <div className="w-full relative">
            <div className="login-accent-bar" />
            <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-8 border border-white/60 login-card-animated-bg login-card-glow">
              {status === 'verifying' && (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="relative h-14 w-14">
                    <div className="absolute inset-0 rounded-full animate-spin" style={{ background: 'conic-gradient(from 0deg, #0d9488, #2dd4bf, #0d9488)', animationDuration: '1.5s' }} />
                    <div className="absolute inset-1.5 rounded-full bg-white" />
                    <Loader2 className="absolute inset-0 m-auto h-6 w-6 text-[#0d9488] animate-spin" style={{ animationDuration: '2s' }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'Bekræfter e-mail...' : 'Verifying email...'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {lang === 'da' ? 'Et øjeblik.' : 'One moment.'}
                    </p>
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-16 w-16 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
                    <CheckCircle2 className="h-9 w-9 text-[#0d9488]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'E-mail bekræftet!' : 'Email verified!'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                      {lang === 'da'
                        ? 'Din e-mailadresse er nu bekræftet. Du kan logge ind.'
                        : 'Your email address has been verified. You can now log in.'}
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={handleGoToLogin}
                    className="w-full h-11 btn-primary text-white font-medium text-sm mt-2"
                  >
                    {lang === 'da' ? 'Log ind' : 'Sign in'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {status === 'error' && (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                    <XCircle className="h-9 w-9 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'da' ? 'Bekræftelse fejlede' : 'Verification failed'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                      {errorMessage}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoToLogin}
                    className="w-full h-11 font-medium text-sm mt-2"
                  >
                    {lang === 'da' ? 'Tilbage til login' : 'Back to login'}
                  </Button>
                </div>
              )}
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

export function VerifyEmailScreen({ token }: { token: string }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8faf9]">
          <Loader2 className="h-8 w-8 text-[#0d9488] animate-spin" />
        </div>
      }
    >
      <VerifyEmailInner token={token} />
    </Suspense>
  );
}
