/**
 * Setup contract (F05).
 *
 * Proves that the shared Vitest setup file (vitest.setup.ts) really runs for
 * these test files: the jest-dom matchers it imports are registered, and the
 * afterEach cleanup hook it installs removes DOM rendered by earlier tests.
 * If setupFiles is dropped from vitest.config.ts, these tests fail.
 */
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

it('exposes the jest-dom matchers imported by vitest.setup.ts', () => {
  const probe = document.createElement('span');
  probe.textContent = 'winmix';
  document.body.appendChild(probe);
  expect(probe).toBeInTheDocument();
  expect(probe).toHaveTextContent('winmix');
  probe.remove();
});

it('renders through the shared testing-library setup', () => {
  render(createElement('div', { 'data-testid': 'setup-probe' }, 'probe'));
  expect(screen.getByTestId('setup-probe')).toBeVisible();
  expect(document.body).not.toBeEmptyDOMElement();
});

it('vitest.setup.ts afterEach cleanup ran after the previous test', () => {
  expect(screen.queryByTestId('setup-probe')).toBeNull();
  expect(document.body).toBeEmptyDOMElement();
});
