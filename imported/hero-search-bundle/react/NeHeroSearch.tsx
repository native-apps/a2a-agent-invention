import React, { forwardRef } from 'react';
import '@/web-components/ne-hero-search';

const NeHeroSearch = forwardRef<HTMLElement>((props, ref) => {
  // All logic is now encapsulated within the custom element.
  // This wrapper's only job is to render the tag and forward the ref.
  return <ne-hero-search ref={ref} />;
});

NeHeroSearch.displayName = 'NeHeroSearch';

export default NeHeroSearch;
