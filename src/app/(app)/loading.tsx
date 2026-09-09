import { PageSkeleton } from '@/components/ui/kit';

/**
 * Route-level loading state for every authenticated page (issue #16): RSC
 * navigations stream the shell instantly instead of freezing until the server
 * fetch (incl. session refresh round-trip) completes.
 */
export default function AppLoading() {
  return <PageSkeleton />;
}
