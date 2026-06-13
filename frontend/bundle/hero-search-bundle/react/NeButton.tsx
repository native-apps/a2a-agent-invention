import React, { useEffect, useRef, forwardRef } from 'react';

// The props for our new universal button wrapper
export interface NeButtonProps extends React.HTMLAttributes<HTMLElement> {
  designId: string;
  onClick?: (event: Event) => void;
  children?: React.ReactNode;
}

export const NeButton = forwardRef<HTMLElement, NeButtonProps>(
  ({ designId, onClick, children, ...props }, ref) => {
    const internalRef = useRef<HTMLElement>(null);
    // Use the forwarded ref if it exists, otherwise use our internal ref
    const buttonRef = (ref || internalRef) as React.RefObject<HTMLElement>;

    // Effect to handle the custom 'ne-press' event and map it to onClick
    useEffect(() => {
      const el = buttonRef.current;
      if (!el || !onClick) return;

      const handleClick = (e: Event) => onClick(e);

      // Our custom element fires 'ne-press', we listen for it here.
      el.addEventListener('ne-press', handleClick);

      // Cleanup on unmount
      return () => {
        el.removeEventListener('ne-press', handleClick);
      };
    }, [onClick, buttonRef]);

    return (
      <ne-button ref={buttonRef} design-id={designId} {...props}>
        {children}
      </ne-button>
    );
  }
);

NeButton.displayName = 'NeButton';
