'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, Check, Mail, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

interface RegisterFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const { t, language } = useTranslation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (password !== confirmPassword) {
        setError(t('passwordsDoNotMatch'));
        return;
      }

      if (password.length < 6) {
        setError(t('passwordMinLength'));
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, businessName }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || t('registrationFailed'));
          return;
        }

        // Registration successful — show "check your email" screen
        setRegisteredEmail(data.email);
      } catch {
        setError(t('anErrorOccurred'));
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, confirmPassword, businessName, t]
  );

  // ─── "Check your email" confirmation screen ───
  if (registeredEmail) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-14 w-14 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-[#0d9488]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {language === 'da' ? 'Tjek din e-mail' : 'Check your email'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              {language === 'da'
                ? `Vi har sendt en bekræftelses-e-mail til:`
                : `We've sent a verification email to:`}
            </p>
            <p className="text-sm font-medium text-[#0d9488] mt-1 break-all">{registeredEmail}</p>
          </div>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            {language === 'da'
              ? 'Du skal bekræfte din e-mailadresse, før du kan logge ind. Klik på linket i e-mailen for at fortsætte.'
              : 'You must verify your email address before you can log in. Click the link in the email to continue.'}
          </p>
        </div>

        <Button
          type="button"
          onClick={onSwitchToLogin}
          className="w-full h-11 btn-primary text-white font-medium text-sm"
        >
          {language === 'da' ? 'Tilbage til login' : 'Back to login'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  const features = language === 'da'
    ? [
        'Dobbelt bogføring med finansjournal',
        'Automatisk moms beregning',
        'Dansk Peppol e-fakturering',
        'Realtid rapporter & eksporter'
      ]
    : [
        'Double-entry bookkeeping & journal',
        'Automatic VAT calculations',
        'Danish Peppol e-invoicing',
        'Real-time reports & exports'
      ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="businessName" className="text-gray-700">
          {t('businessName')} <span className="text-gray-400">({t('optional')})</span>
        </Label>
        <Input
          id="businessName"
          type="text"
          placeholder={language === 'da' ? 'Din Virksomhed ApS' : 'Your Business ApS'}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          disabled={isLoading}
          className="focus:border-[#0d9488] transition-all duration-200"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email" className="text-gray-700">{t('email')}</Label>
        <Input
          id="register-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="focus:border-[#0d9488] transition-all duration-200"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="register-password" className="text-gray-700">{t('password')}</Label>
          <Input
            id="register-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="focus:border-[#0d9488] transition-all duration-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-gray-700">{t('confirm')}</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            className="focus:border-[#0d9488] transition-all duration-200"
          />
        </div>
      </div>

      <div className="pt-2">
        <div className="grid grid-cols-2 gap-2">
          {features.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-xs text-gray-600">
              <Check className="h-3.5 w-3.5 text-[#0d9488]" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        className="w-full btn-primary text-white font-medium"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('creatingAccount')}
          </>
        ) : (
          <>
            {t('createAccount')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="px-2 text-gray-500">
            {t('or')}
          </span>
        </div>
      </div>

      <p className="text-sm text-center text-gray-600">
        {t('hasAccount')}{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-[#0d9488] hover:text-[#0f766e] font-medium"
        >
          {t('signInLink')}
        </button>
      </p>
    </form>
  );
}
