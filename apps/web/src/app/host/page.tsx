import type { Metadata } from 'next';
import DuoApp from '@/components/DuoApp';

export const metadata: Metadata = {
  title: 'Host Access · Study with Game',
  description: 'Host sign-in.'
};

export default function HostPage() {
  return <DuoApp hostMode />;
}
