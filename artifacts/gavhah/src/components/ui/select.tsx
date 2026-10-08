"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type RootProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  name?: string
  children?: React.ReactNode
}

type MarkerProps = {
  children?: React.ReactNode
  className?: string
  placeholder?: string
  value?: string
  disabled?: boolean
  [key: string]: unknown
}

type OptionDef = {
  value: string
  label: string
  disabled?: boolean
}

const SELECT_TRIGGER = Symbol("SafeSelectTrigger")
const SELECT_VALUE = Symbol("SafeSelectValue")
const SELECT_CONTENT = Symbol("SafeSelectContent")
const SELECT_ITEM = Symbol("SafeSelectItem")
const SELECT_GROUP = Symbol("SafeSelectGroup")
const SELECT_LABEL = Symbol("SafeSelectLabel")
const SELECT_SEPARATOR = Symbol("SafeSelectSeparator")

function marker(symbol: symbol, displayName: string) {
  const Component = ({ children }: MarkerProps) => <>{children}</>
  ;(Component as any).__safeSelectMarker = symbol
  Component.displayName = displayName
  return Component
}

const SelectTrigger = marker(SELECT_TRIGGER, "SelectTrigger")
const SelectValue = marker(SELECT_VALUE, "SelectValue")
const SelectContent = marker(SELECT_CONTENT, "SelectContent")
const SelectItem = marker(SELECT_ITEM, "SelectItem")
const SelectGroup = marker(SELECT_GROUP, "SelectGroup")
const SelectLabel = marker(SELECT_LABEL, "SelectLabel")
const SelectSeparator = marker(SELECT_SEPARATOR, "SelectSeparator")
const SelectScrollUpButton = marker(Symbol("SafeSelectScrollUp"), "SelectScrollUpButton")
const SelectScrollDownButton = marker(Symbol("SafeSelectScrollDown"), "SelectScrollDownButton")

function markerOf(node: React.ReactElement) {
  return (node.type as any)?.__safeSelectMarker as symbol | undefined
}

function textFromNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textFromNode).join("")
  if (React.isValidElement(node)) return textFromNode((node.props as any).children)
  return ""
}

function walk(
  node: React.ReactNode,
  state: {
    options: OptionDef[]
    triggerProps: Record<string, any>
    placeholder?: string
  },
) {
  React.Children.forEach(node, child => {
    if (!React.isValidElement(child)) return
    const props = child.props as MarkerProps
    const kind = markerOf(child)

    if (kind === SELECT_TRIGGER) {
      const { children: _children, ...rest } = props
      state.triggerProps = { ...state.triggerProps, ...rest }
      walk(props.children, state)
      return
    }

    if (kind === SELECT_VALUE) {
      if (typeof props.placeholder === "string") state.placeholder = props.placeholder
      return
    }

    if (kind === SELECT_ITEM) {
      const value = typeof props.value === "string" ? props.value : ""
      state.options.push({
        value,
        label: textFromNode(props.children).trim() || value,
        disabled: Boolean(props.disabled),
      })
      return
    }

    walk(props.children, state)
  })
}

function Select({
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  children,
}: RootProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const controlled = value !== undefined
  const currentValue = controlled ? value : internalValue

  const parsed = React.useMemo(() => {
    const state: {
      options: OptionDef[]
      triggerProps: Record<string, any>
      placeholder?: string
    } = { options: [], triggerProps: {} }
    walk(children, state)
    return state
  }, [children])

  const {
    className,
    id,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    title,
  } = parsed.triggerProps

  const hasCurrentOption = parsed.options.some(option => option.value === currentValue)

  return (
    <select
      id={id}
      name={name}
      value={hasCurrentOption ? currentValue : ""}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      title={title}
      onChange={event => {
        const next = event.target.value
        if (!controlled) setInternalValue(next)
        onValueChange?.(next)
      }}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background",
        "focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {parsed.placeholder && !hasCurrentOption && (
        <option value="" disabled>
          {parsed.placeholder}
        </option>
      )}
      {parsed.options.map((option, index) => (
        <option
          key={option.value + ":" + index}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
