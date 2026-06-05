import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input placeholder="Enter value" />);
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });

  it('accepts and displays typed value', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="Type here" />);
    const input = screen.getByPlaceholderText('Type here');
    await user.type(input, 'hello world');
    expect(input).toHaveValue('hello world');
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input disabled placeholder="disabled" />);
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled();
  });

  it('applies aria-invalid when invalid', () => {
    render(<Input aria-invalid="true" placeholder="bad" />);
    expect(screen.getByPlaceholderText('bad')).toHaveAttribute('aria-invalid', 'true');
  });
});
