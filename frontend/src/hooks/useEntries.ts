import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateEntryParams } from '../lib/api';
import { useJournalStore } from '../stores/journalStore';

// Query keys
export const entryKeys = {
  all: ['entries'] as const,
  lists: () => [...entryKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...entryKeys.lists(), filters] as const,
  details: () => [...entryKeys.all, 'detail'] as const,
  detail: (id: string) => [...entryKeys.details(), id] as const
};

// Get entries list
export function useEntries(params?: {
  limit?: number;
  offset?: number;
  mood?: string;
  tag?: string;
  startDate?: string;
  endDate?: string;
}) {
  const setEntries = useJournalStore((state) => state.setEntries);

  return useQuery({
    queryKey: entryKeys.list(params || {}),
    queryFn: async () => {
      const data = await api.getEntries(params);
      setEntries(data.entries as any);
      return data;
    }
  });
}

// Get single entry
export function useEntry(id: string) {
  return useQuery({
    queryKey: entryKeys.detail(id),
    queryFn: () => api.getEntry(id),
    enabled: !!id
  });
}

// Create entry mutation
export function useCreateEntry() {
  const queryClient = useQueryClient();
  const addEntry = useJournalStore((state) => state.addEntry);

  return useMutation({
    mutationFn: (params: CreateEntryParams) => api.createEntry(params),
    onSuccess: (data) => {
      addEntry(data as any);
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
    }
  });
}

// Update entry mutation
export function useUpdateEntry() {
  const queryClient = useQueryClient();
  const updateEntry = useJournalStore((state) => state.updateEntry);

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CreateEntryParams> }) =>
      api.updateEntry(id, updates),
    onSuccess: (data, { id }) => {
      updateEntry(id, data as any);
      queryClient.invalidateQueries({ queryKey: entryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
    }
  });
}

// Delete entry mutation
export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
    }
  });
}

// Generate reflection mutation
export function useGenerateReflection() {
  const queryClient = useQueryClient();
  const updateEntry = useJournalStore((state) => state.updateEntry);

  return useMutation({
    mutationFn: ({
      entryId,
      style
    }: {
      entryId: string;
      style?: 'brief' | 'deep' | 'questioning';
    }) => api.generateReflection(entryId, style),
    onSuccess: (data, { entryId }) => {
      updateEntry(entryId, { reflection: data.reflection } as any);
      queryClient.invalidateQueries({ queryKey: entryKeys.detail(entryId) });
    }
  });
}
