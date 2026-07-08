import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModels } from '@/hooks/useModels';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { UseCaseSelector } from '@/components/UseCaseSelector';
import { SortSelector } from '@/components/SortSelector';
import { ApiUsageStep } from '@/components/ApiUsageStep';
import { ModelList } from '@/components/ModelList';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useLocalStorage('freeModels:onboardingStep', 0);
  const [direction, setDirection] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    models,
    loading,
    error,
    activeUseCases,
    activeSort,
    lastUpdated,
    toggleUseCase,
    setActiveSort,
  } = useModels({
    overrideTimeRange: '7d',
    overrideMyReports: false,
    overrideReliabilityFilterEnabled: false,
  });

  const totalPages = Math.ceil(models.length / ITEMS_PER_PAGE);

  // Reset to page 1 when models change (e.g., filter/sort changes)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

  const goToNextStep = () => {
    if (currentStep < 2) {
      setDirection(1);
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
    }
  };

  const steps = [
    {
      title: 'What are you building?',
      description: 'Select models by use case',
      content: (
        <UseCaseSelector
          activeFilters={activeUseCases}
          onToggleFilter={toggleUseCase}
          onConfirm={goToNextStep}
        />
      ),
    },
    {
      title: 'Set Fallback Priority',
      description: 'Models are tried in order - first = primary, rest = fallbacks',
      content: (
        <SortSelector
          activeSort={activeSort}
          onSortChange={setActiveSort}
          onConfirm={goToNextStep}
        />
      ),
    },
    {
      title: 'Add to Your Project',
      description: 'Copy the helper file and start using free models',
      content: <ApiUsageStep variant="compact" />,
      wide: true,
    },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentStep > 0) {
        goToPrevStep();
      } else if (e.key === 'ArrowRight' && currentStep < steps.length - 1) {
        goToNextStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  return (
    <div className="space-y-6">
      {/* Step Navigation */}
      <div className="flex items-center justify-center gap-3">
        {/* Left Arrow */}
        <button
          onClick={goToPrevStep}
          disabled={currentStep === 0}
          className={`p-2 rounded-full transition-colors ${
            currentStep === 0
              ? 'text-muted-foreground/30 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          aria-label="Previous step"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Dots */}
        <div className="flex gap-2">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setDirection(index > currentStep ? 1 : -1);
                setCurrentStep(index);
              }}
              className={`h-2 w-2 rounded-full transition-colors ${
                index === currentStep
                  ? 'bg-primary'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {/* Right Arrow */}
        <button
          onClick={goToNextStep}
          disabled={currentStep === steps.length - 1}
          className={`p-2 rounded-full transition-colors ${
            currentStep === steps.length - 1
              ? 'text-muted-foreground/30 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          aria-label="Next step"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Step Content with Animation */}
      <div className="relative overflow-hidden min-h-45">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={springTransition}
          >
            <OnboardingStep
              stepNumber={currentStep + 1}
              title={steps[currentStep].title}
              description={steps[currentStep].description}
              showConfirm={false}
              wide={steps[currentStep].wide}
            >
              {steps[currentStep].content}
            </OnboardingStep>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Model List with Pagination (Hidden on Step 3) */}
      {currentStep !== 2 && (
        <ModelList
          models={models}
          loading={loading}
          error={error}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          itemsPerPage={ITEMS_PER_PAGE}
          lastUpdated={lastUpdated}
        />
      )}
    </div>
  );
}
