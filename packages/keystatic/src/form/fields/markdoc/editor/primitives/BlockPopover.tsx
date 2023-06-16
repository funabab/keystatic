import {
  AriaPopoverProps,
  PopoverAria,
  useOverlay,
  useOverlayPosition,
} from '@react-aria/overlays';
import { mergeProps, useLayoutEffect } from '@react-aria/utils';
import {
  OverlayTriggerState,
  useOverlayTriggerState,
} from '@react-stately/overlays';
import {
  ReactNode,
  Ref,
  RefObject,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { Overlay, PopoverProps } from '@voussoir/overlays';
import { css, tokenSchema, transition } from '@voussoir/style';

type BlockPopoverProps = Pick<PopoverProps, 'hideArrow' | 'placement'> & {
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export const BlockPopover = forwardRef(function BlockPopover(
  { placement: preferredPlacement, triggerRef, ...props }: BlockPopoverProps,
  ref: Ref<() => void>
) {
  let wrapperRef = useRef<HTMLDivElement>(null);
  let popoverRef = useRef(null);
  const state = useOverlayTriggerState({
    isOpen: true,
  });
  let { placement, popoverProps, updatePosition } = useBlockPopover(
    {
      isNonModal: true,
      isKeyboardDismissDisabled: false,
      placement: preferredPlacement,
      triggerRef: triggerRef as any,
      popoverRef,
    },
    state
  );

  useImperativeHandle(ref, () => updatePosition, [updatePosition]);

  return (
    <Overlay
      isOpen
      // @ts-expect-error FIXME: resolve ref inconsistencies
      nodeRef={wrapperRef}
    >
      <div
        ref={popoverRef}
        {...popoverProps}
        data-open={state.isOpen}
        data-placement={placement}
        contentEditable={false}
        className={css({
          backgroundColor: tokenSchema.color.background.surface, // TODO: component token?
          borderRadius: tokenSchema.size.radius.medium, // TODO: component token?
          border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.emphasis}`,
          boxSizing: 'content-box', // resolves measurement/scroll issues related to border
          // boxShadow: `0 0 0 ${tokenSchema.size.border.regular} ${tokenSchema.color.border.emphasis}`,
          minHeight: tokenSchema.size.element.regular,
          minWidth: tokenSchema.size.element.regular,
          opacity: 0,
          outline: 0,
          pointerEvents: 'auto',
          position: 'absolute',
          // use filter:drop-shadow instead of box-shadow so the arrow is included
          filter: `drop-shadow(0 1px 4px ${tokenSchema.color.shadow.regular})`,
          // filter bug in safari: https://stackoverflow.com/questions/56478925/safari-drop-shadow-filter-remains-visible-even-with-hidden-element
          willChange: 'filter',
          userSelect: 'none',

          // placement
          '&[data-placement="top"]': {
            marginBottom: tokenSchema.size.space.regular,
            transform: `translateY(${tokenSchema.size.space.regular})`,
          },
          '&[data-placement="bottom"]': {
            marginTop: tokenSchema.size.space.regular,
            transform: `translateY(calc(${tokenSchema.size.space.regular} * -1))`,
          },

          '&[data-open="true"]': {
            opacity: 1,
            transform: `translateX(0) translateY(0)`,

            // enter animation
            transition: transition(['opacity', 'transform'], {
              easing: 'easeOut',
            }),
          },
        })}
      >
        {props.children}
      </div>
    </Overlay>
  );
});

/**
 * Provides the behavior and accessibility implementation for a popover component.
 * A popover is an overlay element positioned relative to a trigger.
 */
function useBlockPopover(
  props: AriaPopoverProps,
  state: OverlayTriggerState
): PopoverAria & { updatePosition: () => void } {
  let {
    triggerRef,
    popoverRef,
    isNonModal,
    isKeyboardDismissDisabled,
    ...otherProps
  } = props;

  let [isSticky, setSticky] = useState(false);

  let { overlayProps, underlayProps } = useOverlay(
    {
      isOpen: state.isOpen,
      onClose: state.close,
      shouldCloseOnBlur: true,
      isDismissable: !isNonModal,
      isKeyboardDismissDisabled: false,
    },
    popoverRef
  );

  // stick the popover to the bottom of the viewport instead of flipping
  const containerPadding = 8;
  useEffect(() => {
    if (state.isOpen) {
      const checkForStickiness = () => {
        const vh = Math.max(
          document.documentElement.clientHeight || 0,
          window.innerHeight || 0
        );
        let popoverRect = popoverRef.current?.getBoundingClientRect();
        let triggerRect = triggerRef.current?.getBoundingClientRect();
        if (popoverRect && triggerRect) {
          setSticky(
            triggerRect.bottom + popoverRect.height + containerPadding * 2 >
              vh && triggerRect.top < vh
          );
        }
      };
      checkForStickiness();
      window.addEventListener('scroll', checkForStickiness);
      return () => {
        checkForStickiness();
        window.removeEventListener('scroll', checkForStickiness);
      };
    }
  }, [popoverRef, triggerRef, state.isOpen]);

  let {
    overlayProps: positionProps,
    arrowProps,
    placement,
    updatePosition,
  } = useOverlayPosition({
    ...otherProps,
    containerPadding,
    shouldFlip: false,
    targetRef: triggerRef,
    overlayRef: popoverRef,
    isOpen: state.isOpen,
    onClose: undefined,
  });

  // force update position when the trigger changes
  let previousBoundingRect = usePrevious(
    triggerRef.current?.getBoundingClientRect()
  );
  useLayoutEffect(() => {
    if (previousBoundingRect) {
      const currentBoundingRect = triggerRef.current?.getBoundingClientRect();
      if (currentBoundingRect) {
        const hasChanged =
          previousBoundingRect.height !== currentBoundingRect.height ||
          previousBoundingRect.width !== currentBoundingRect.width ||
          previousBoundingRect.x !== currentBoundingRect.x ||
          previousBoundingRect.y !== currentBoundingRect.y;
        if (hasChanged) {
          updatePosition();
        }
      }
    }
  }, [previousBoundingRect, triggerRef, updatePosition]);

  // make sure popovers are below modal dialogs and their blanket
  if (positionProps.style) {
    positionProps.style.zIndex = 1;
  }

  // switching to position: fixed will undoubtedly bite me later, but this hack works for now
  if (isSticky) {
    positionProps.style = {
      ...positionProps.style,
      // @ts-expect-error
      maxHeight: null,
      position: 'fixed',
      // @ts-expect-error
      top: null,
      bottom: containerPadding,
    };
  }

  return {
    arrowProps,
    placement,
    popoverProps: mergeProps(overlayProps, positionProps),
    underlayProps,
    updatePosition,
  };
}

function usePrevious<T>(value: T) {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}