import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders with default variant', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('renders as disabled when disabled prop is set', () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    let count = 0;
    render(<Button onClick={() => count++}>Add</Button>);
    await user.click(screen.getByRole('button'));
    expect(count).toBe(1);
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    let count = 0;
    render(<Button disabled onClick={() => count++}>Add</Button>);
    await user.click(screen.getByRole('button'));
    expect(count).toBe(0);
  });

  it('applies custom className', () => {
    render(<Button className="my-custom-class">X</Button>);
    expect(screen.getByRole('button')).toHaveClass('my-custom-class');
  });
});
