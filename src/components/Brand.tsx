import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BrandMark({ size = 35, className }: { size?: number; className?: string }) {
  return <img className={className} src="/icons/pb-dash-192.png" alt="" width={size} height={size} />;
}

export function Brand({ to }: { to: string }) {
  return (
    <Link className="pb-brand" to={to}>
      <BrandMark className="pb-brand-mark" />
      <span>PB Dash</span>
    </Link>
  );
}

export function AppFooter() {
  return (
    <footer className="pb-footer pb-wrap">
      <span>Powered by the <a href="https://www.concept2.com/" target="_blank" rel="noreferrer">Concept2 Logbook <ArrowUpRight size={12} aria-hidden="true" /></a></span>
      <span>A <a href="https://pressthe8.com/" target="_blank" rel="noreferrer">Pressthe8 <ArrowUpRight size={12} aria-hidden="true" /></a> project</span>
    </footer>
  );
}
