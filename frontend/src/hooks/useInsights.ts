import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

// Query keys
export const insightKeys = {
  all: ['insights'] as const,
  stats: (period: string) => [...insightKeys.all, 'stats', period] as const,
  summary: (period: string) => [...insightKeys.all, 'summary', period] as const,
  patterns: () => [...insightKeys.all, 'patterns'] as const
};

// Get insights stats
export function useInsights(period: 'week' | 'month' | 'quarter' = 'week') {
  return useQuery({
    queryKey: insightKeys.stats(period),
    queryFn: () => api.getInsights(period),
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
}

// Get AI-generated summary
export function useSummary(period: 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: insightKeys.summary(period),
    queryFn: () => api.getSummary(period),
    staleTime: 1000 * 60 * 30 // 30 minutes (expensive to generate)
  });
}

// Get pattern analysis
export function usePatterns() {
  return useQuery({
    queryKey: insightKeys.patterns(),
    queryFn: () => api.getPatterns(),
    staleTime: 1000 * 60 * 30 // 30 minutes
  });
}
