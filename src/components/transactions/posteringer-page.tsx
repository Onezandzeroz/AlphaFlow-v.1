'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { useScannerStore } from '@/lib/scanner-store';
import { TransactionsPage } from '@/components/transactions/transactions-page';
import { RecurringEntriesPage } from '@/components/recurring-entries/recurring-entries-page';
import { PageHeader } from '@/components/shared/page-header';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Receipt, RefreshCw, Plus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PosteringerPageProps {
  user: any; // User type from auth-store
  defaultTab?: 'transactions' | 'recurring';
}

export function PosteringerPage({ user, defaultTab = 'transactions' }: PosteringerPageProps) {
  const { language } = useLanguageStore();
  const { t } = useTranslation();
  const isDa = language === 'da';
  const [activeTab, setActiveTab] = useState<'transactions' | 'recurring'>(defaultTab);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [recurringTrigger, setRecurringTrigger] = useState(0);
  const [autoOpenScanner, setAutoOpenScanner] = useState(false);
  const { pendingScan, consumeScan } = useScannerStore();

  // When 'Scan bilag' is clicked from the Quick Actions FAB, open the
  // add-transaction dialog with the cam scanner pre-activated.
  const scanProcessedRef = useRef(false);
  useEffect(() => {
    if (pendingScan && !scanProcessedRef.current) {
      scanProcessedRef.current = true;
      // Use a short delay to ensure the component has finished mounting
      // and the Dialog can properly render before we set state.
      // consumeScan() is deferred to prevent re-render clearing the timer.
      const timer = setTimeout(() => {
        setAutoOpenScanner(true);
        setIsTransactionDialogOpen(true);
        consumeScan();
      }, 50);
      return () => clearTimeout(timer);
    }
    if (!pendingScan) {
      scanProcessedRef.current = false;
    }
  }, [pendingScan, consumeScan]);

  const handleAddTransaction = useCallback(() => {
    setIsTransactionDialogOpen(false);
  }, []);

  const handleOpenRecurringDialog = useCallback(() => {
    setRecurringTrigger((prev) => prev + 1);
  }, []);

  // Switch from transaction dialog to recurring entry: close dialog, switch tab, open recurring create
  const handleSwitchToRecurring = useCallback(() => {
    setIsTransactionDialogOpen(false);
    setActiveTab('recurring');
    // Small delay so the tab switch renders RecurringEntriesPage before triggering create
    setTimeout(() => setRecurringTrigger((prev) => prev + 1), 100);
  }, []);

  const tabs = [
    {
      id: 'transactions' as const,
      labelDa: 'Alle posteringer',
      labelEn: 'All Transactions',
      icon: Receipt,
    },
    {
      id: 'recurring' as const,
      labelDa: 'Gentagende posteringer',
      labelEn: 'Recurring Entries',
      icon: RefreshCw,
    },
  ];

  return (
    <div className="space-y-0">
      {/* Unified PageHeader with stacked action buttons */}
      <div className="p-3 lg:p-6 pb-0">
        <PageHeader
          title={isDa ? 'Posteringer' : 'Transactions'}
          description={isDa
            ? 'Håndter og spore alle dine posteringer'
            : 'Manage and track all your transactions'}
          action={
            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
              <Button
                onClick={() => setIsTransactionDialogOpen(true)}
                className="bg-[#0d9488] hover:bg-[#0d9488]/90 text-white border border-[#0d9488] gap-2 lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm text-sm font-medium transition-all"
              >
                <Plus className="h-4 w-4" />
                {isDa ? 'Tilføj postering' : 'Add Transaction'}
              </Button>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto dialog-bg-translucent backdrop-blur-md lg:backdrop-blur-none">
                <DialogHeader>
                  <DialogTitle className="dark:text-white flex items-center gap-2">
                    <Plus className="h-5 w-5 text-[#2dd4bf]" />
                    {t('addTransaction')}
                  </DialogTitle>
                  <DialogDescription className="dark:text-gray-400">{t('recordNewTransaction')}</DialogDescription>
                </DialogHeader>
                <AddTransactionForm
                  onSuccess={handleAddTransaction}
                  autoOpenScanner={autoOpenScanner}
                  onScannerOpened={() => setAutoOpenScanner(false)}
                />
                <div className="pt-2 mt-2 border-t border-gray-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={handleSwitchToRecurring}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/5 dark:hover:bg-[#2dd4bf]/5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="flex-1 text-left font-medium">
                      {isDa ? 'Tilføj gentagende postering' : 'Add recurring entry'}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />
      </div>

      {/* Tab bar */}
      <div className="px-4 lg:px-8">
        <div className="flex items-center gap-1 border-b border-[#e2e8e6] dark:border-[#2a3330]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px',
                  isActive
                    ? 'border-[#0d9488] text-[#0d9488] dark:border-[#2dd4bf] dark:text-[#2dd4bf]'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="h-4 w-4" />
                {isDa ? tab.labelDa : tab.labelEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — hideHeader since PosteringerPage owns the header */}
      <div className="mt-4">
        {activeTab === 'transactions' ? (
          <TransactionsPage user={user} hideHeader />
        ) : (
          <RecurringEntriesPage user={user} hideHeader triggerCreate={recurringTrigger} />
        )}
      </div>
    </div>
  );
}
