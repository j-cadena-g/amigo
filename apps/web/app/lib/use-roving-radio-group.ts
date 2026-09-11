import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type RefCallback,
} from "react";

/**
 * Pure keyboard-navigation logic for an ARIA radio group: given the index of
 * the radio that received the key event, return the index that should become
 * focused + checked. Arrow keys wrap around; Home/End jump to the ends.
 * Returns null for keys the radio-group pattern does not handle.
 */
export function getRovingRadioTargetIndex(
  currentIndex: number,
  key: string,
  optionCount: number,
): number | null {
  if (optionCount <= 0 || currentIndex < 0 || currentIndex >= optionCount) {
    return null;
  }
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (currentIndex + 1) % optionCount;
    case "ArrowLeft":
    case "ArrowUp":
      return (currentIndex - 1 + optionCount) % optionCount;
    case "Home":
      return 0;
    case "End":
      return optionCount - 1;
    default:
      return null;
  }
}

export interface RovingRadioProps {
  tabIndex: number;
  ref: RefCallback<HTMLElement>;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Implements the ARIA radio-group keyboard interaction model for a set of
 * `role="radio"` buttons:
 *
 * - Roving tabindex: the group is a single tab stop. The checked radio gets
 *   `tabIndex: 0`, the rest get `-1`; if nothing is checked, the first
 *   option is tabbable.
 * - Arrow keys (and Home/End) move BOTH focus and selection, wrapping at the
 *   ends. Selection goes through the same `onSelect` callback the click
 *   handler uses, so keyboard and pointer behavior stay identical.
 *
 * Spread the returned props onto each radio element and keep the existing
 * `onClick` / `aria-checked` markup unchanged.
 */
export function useRovingRadioGroup<T extends string>(
  options: readonly T[],
  selectedValue: T | null | undefined,
  onSelect: (value: T) => void,
): (value: T) => RovingRadioProps {
  const elementsRef = useRef(new Map<T, HTMLElement>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  return useCallback(
    (value: T): RovingRadioProps => {
      const index = options.indexOf(value);
      const selectedIndex =
        selectedValue == null ? -1 : options.indexOf(selectedValue);
      const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

      return {
        tabIndex: index === tabbableIndex ? 0 : -1,
        ref: (element) => {
          if (element) {
            elementsRef.current.set(value, element);
          } else {
            elementsRef.current.delete(value);
          }
        },
        onKeyDown: (event) => {
          const targetIndex = getRovingRadioTargetIndex(
            index,
            event.key,
            options.length,
          );
          if (targetIndex === null) return;
          event.preventDefault();
          const targetValue = options[targetIndex];
          if (targetValue === undefined) return;
          elementsRef.current.get(targetValue)?.focus();
          onSelectRef.current(targetValue);
        },
      };
    },
    [options, selectedValue],
  );
}
