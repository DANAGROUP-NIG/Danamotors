"use client";

import { useEffect, useState, type ChangeEventHandler, type InputHTMLAttributes, type Ref } from "react";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  ref?: Ref<HTMLInputElement>;
};

/** Number mode: the caller keeps a number. */
type NumberModeProps = BaseProps & {
  value: number | null | undefined;
  /** The typed number, or null while the field is empty. */
  onValueChange: (value: number | null) => void;
  onChange?: never;
};

/**
 * Drop-in mode: the same props as `<input type="number">` (text state, react-hook-form `register`, or
 * `defaultValue`). `onChange` gets the usual event, with leading zeros already removed from its value.
 */
type TextModeProps = BaseProps & {
  value?: string | number;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onValueChange?: never;
};

export type NumberInputProps = NumberModeProps | TextModeProps;

const toText = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "" : String(value));

/** "0434" → "434", "007.5" → "7.5"; keeps "0", "0." and "-0.5". */
export const dropLeadingZeros = (text: string) => text.replace(/^(-?)0+(?=\d)/, "$1");

/**
 * The only number field to use in the client (ESLint blocks a raw `<input type="number">`).
 * A plain number input shows "0434" when the user types after a 0, and one bound to a number turns an
 * emptied field back into 0. Here focusing selects the contents, leading zeros are dropped as the user
 * types, and in number mode an emptied field stays empty (reported as null).
 */
export function NumberInput(props: NumberInputProps) {
  return typeof props.onValueChange === "function" ? (
    <NumberModeInput {...(props as NumberModeProps)} />
  ) : (
    <TextModeInput {...(props as TextModeProps)} />
  );
}

function selectOnFocus(onFocus: BaseProps["onFocus"]): BaseProps["onFocus"] {
  return (e) => {
    e.currentTarget.select();
    onFocus?.(e);
  };
}

function TextModeInput({ onChange, onFocus, ...props }: TextModeProps) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- the one place a raw number input is allowed
    <input
      {...props}
      type="number"
      onFocus={selectOnFocus(onFocus)}
      onChange={(e) => {
        const text = dropLeadingZeros(e.target.value);
        if (text !== e.target.value) e.target.value = text;
        onChange?.(e);
      }}
    />
  );
}

function NumberModeInput({ value, onValueChange, onFocus, ...props }: NumberModeProps) {
  const [text, setText] = useState(() => toText(value));

  // Follow changes made outside the field (form reset, recalculated defaults). An empty field stays empty
  // when the caller stores it as 0, so clearing the field never puts a 0 back.
  useEffect(() => {
    setText((current) => {
      const typed = current.trim() === "" ? null : Number(current);
      if (typed === (value ?? null) || (typed === null && (value == null || value === 0))) return current;
      return toText(value);
    });
  }, [value]);

  return (
    // eslint-disable-next-line no-restricted-syntax -- the one place a raw number input is allowed
    <input
      {...props}
      type="number"
      value={text}
      onFocus={selectOnFocus(onFocus)}
      onChange={(e) => {
        const next = dropLeadingZeros(e.target.value);
        setText(next);
        const parsed = next.trim() === "" ? null : Number(next);
        if (parsed !== null && !Number.isFinite(parsed)) return;
        onValueChange(parsed);
      }}
    />
  );
}
