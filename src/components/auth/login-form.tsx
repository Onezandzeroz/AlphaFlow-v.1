'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveCheckbox } from '@/components/ui/responsive-checkbox';
import { Loader2, ArrowRight, Shield, Lock, Zap, Mail } from 'lucide-react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

interface LoginFormProps {
  onSuccess: (user: User) => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const { t, language } = useTranslation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setNeedsVerification(null);
      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          // Handle email verification required
          if (data.needsVerification) {
            setNeedsVerification(data.email);
            return;
          }
          setError(data.error || t('loginFailed'));
          return;
        }

        onSuccess(data.user);
      } catch {
        setError(t('anErrorOccurred'));
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, onSuccess, t]
  );

  if (showForgotPassword) {
    return <ForgotPasswordForm onBackToLogin={() => setShowForgotPassword(false)} />;
  }

  // ─── "Verify your email" screen (shown when login is blocked) ───
  if (needsVerification) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-14 w-14 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
            <Mail className="h-7 w-7 text-amber-500 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {language === 'da' ? 'E-mail ikke bekræftet' : 'Email not verified'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              {language === 'da'
                ? `Din e-mailadresse er endnu ikke bekræftet. Vi har sendt en bekræftelses-e-mail til:`
                : `Your email address has not been verified yet. We've sent a verification email to:`}
            </p>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1 break-all">{needsVerification}</p>
          </div>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            {language === 'da'
              ? 'Klik på linket i e-mailen for at bekræfte din adresse. Tjek også din spam-mappe.'
              : 'Click the link in the email to verify your address. Also check your spam folder.'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setNeedsVerification(null)}
          className="w-full h-11 font-medium text-sm"
        >
          <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
          {language === 'da' ? 'Tilbage til login' : 'Back to login'}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50/80 rounded-xl border border-red-200/60">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {t('email')}
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="pl-10 login-input-teal h-11 bg-white/60 transition-all duration-200"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          {t('password')}
        </Label>
        <div className="relative">
          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="pl-10 login-input-teal h-11 bg-white/60 transition-all duration-200"
          />
        </div>
      </div>

      {/* Remember me checkbox */}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 cursor-pointer group min-h-[44px]">
          <ResponsiveCheckbox
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked)}
            className="h-[18px] w-[18px] rounded-[5px] border-2 border-gray-300 data-[state=checked]:bg-[#0d9488] data-[state=checked]:border-[#0d9488] data-[state=unchecked]:bg-white data-[state=unchecked]:hover:border-[#0d9488]/50 transition-all duration-150"
          />
          <span className="text-[13px] text-gray-600 group-hover:text-gray-800 transition-colors select-none leading-none">
            {'Husk mig'}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setShowForgotPassword(true)}
          className="text-[13px] text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors whitespace-nowrap leading-none"
        >
          {'Glemt kode?'}
        </button>
      </div>

      <Button
        type="submit"
        className="w-full h-11 btn-primary text-white font-medium text-sm"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('signingIn')}
          </>
        ) : (
          <>
            {t('signIn')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      {/* Trust indicators */}
      <div className="flex items-center justify-center gap-4 pt-1">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50/60 dark:bg-white/5 px-2.5 py-1 rounded-full border border-gray-200/40 dark:border-gray-700">
          <Shield className="h-3 w-3 text-[#0d9488]" />
          <span>GDPR-kompatibel</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50/60 dark:bg-white/5 px-2.5 py-1 rounded-full border border-gray-200/40 dark:border-gray-700">
          <Lock className="h-3 w-3 text-[#0d9488]" />
          <span>SSL-krypteret</span>
        </div>
      </div>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200/60"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="px-2 text-gray-400 dark:text-gray-500 bg-transparent">
            {t('or')}
          </span>
        </div>
      </div>
      <p className="text-sm text-center text-gray-600 dark:text-gray-300">
        {t('noAccount')}{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors"
        >
          {t('createOne')}
        </button>
      </p>
    </form>
  );
}
