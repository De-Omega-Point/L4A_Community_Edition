'use client';
import Link from 'next/link';
import ProductBrand from './product-brand';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="product-site">
    <header className="site-header"><ProductBrand /></header>
    <h1>This page could not load</h1>
    <p>Please try again, or return to the home page.</p>
    <button type="button" onClick={reset}>Try again</button> · <Link href="/">Return home</Link>
  </main>;
}
