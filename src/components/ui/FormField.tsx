import React, { useId } from "react";

type FormFieldProps = {
  label: string;
  error?: string;
  required?: boolean;
  children: (inputProps: { id: string; "aria-describedby"?: string }) => React.ReactNode;
  className?: string;
};

/**
 * Wraps a single form control with a consistent label and optional error.
 * Pass a render function so the field can inject a matching `id` into the input/select/textarea.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
  className,
}) => {
  const id = useId();
  const describedBy = error ? `${id}-error` : undefined;
  const classes = ["field"];
  if (className) classes.push(className);
  return (
    <div className={classes.join(" ")}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      {children({ id, "aria-describedby": describedBy })}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
};
