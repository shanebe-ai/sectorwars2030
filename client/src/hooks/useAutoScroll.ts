import { useEffect, useRef } from 'react';

/**
 * Hook that automatically scrolls to an element when a dependency changes
 * @param dependencies Array of values to watch for changes
 * @param behavior Scroll behavior ('smooth' | 'instant' | 'auto')
 * @param offset Additional offset from the top (default: 20px)
 */
export function useAutoScroll(dependencies: any[], behavior: ScrollBehavior = 'smooth', offset: number = 20) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasValidDependency = dependencies.some(dep => dep !== null && dep !== undefined && dep !== '');

    if (elementRef.current && hasValidDependency) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        const element = elementRef.current;
        if (element) {
          // Check if element is inside a scrollable container (like a modal)
          let scrollContainer: Element | Window = window;
          let containerElement = element.parentElement;

          // Walk up the DOM to find a scrollable container
          while (containerElement && containerElement !== document.body) {
            const computedStyle = window.getComputedStyle(containerElement);
            const isScrollable = computedStyle.overflow === 'auto' ||
                               computedStyle.overflow === 'scroll' ||
                               computedStyle.overflowY === 'auto' ||
                               computedStyle.overflowY === 'scroll';

            if (isScrollable && containerElement.scrollHeight > containerElement.clientHeight) {
              scrollContainer = containerElement;
              break;
            }
            containerElement = containerElement.parentElement;
          }

          if (scrollContainer === window) {
            // Page-level scrolling
            const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
            const targetScroll = elementTop - offset;

            window.scrollTo({
              top: targetScroll,
              behavior: behavior
            });
          } else {
            // Container-level scrolling
            const elementTop = element.getBoundingClientRect().top;
            const containerTop = (scrollContainer as Element).getBoundingClientRect().top;
            const relativeTop = elementTop - containerTop;
            const targetScroll = (scrollContainer as Element).scrollTop + relativeTop - offset;

            (scrollContainer as Element).scrollTo({
              top: targetScroll,
              behavior: behavior
            });
          }
        }
      }, 100);
    }
  }, dependencies);

  return elementRef;
}
