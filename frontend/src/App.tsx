import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JournalBuddy from './components/JournalBuddy';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1
    }
  }
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <JournalBuddy />
    </QueryClientProvider>
  );
}

export default App;
