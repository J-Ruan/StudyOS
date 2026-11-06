import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import Stats from '../src/pages/Stats';
import { db, initialSettings, resetData } from '../src/lib/db';
import { DataContext, UIContext, type Data, type UI } from '../src/lib/context';
import { handleNativeBack } from '../src/lib/native';

beforeEach(async () => {
  await resetData();
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  location.hash = '/stats/review';
});
afterEach(async () => {
  cleanup();
  await resetData();
  location.hash = '';
});

function mount() {
  const data: Data = {
    courses: [],
    tasks: [],
    exams: [],
    habits: [],
    checks: [],
    sessions: [],
    overrides: [],
    materials: [],
    reviews: [],
    settings: initialSettings,
  };
  const ui: UI = {
    open: vi.fn(),
    close: vi.fn(),
    notify: vi.fn(),
    focus: vi.fn(),
    confirm: vi.fn().mockResolvedValue(false),
  };
  render(
    <UIContext.Provider value={ui}>
      <DataContext.Provider value={data}>
        <Stats path="/stats/review" />
      </DataContext.Provider>
    </UIContext.Provider>,
  );
  return ui;
}

it('protects inline review notes when Android Back leaves the child page', async () => {
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: '复盘笔记' }), {
    target: { value: '尚未保存的收获' },
  });
  const discard = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await handleNativeBack(discard);
  expect(location.hash).toBe('#/stats/review');
  expect(screen.getByRole('textbox')).toHaveValue('尚未保存的收获');
  await handleNativeBack(discard);
  expect(location.hash).toBe('#/stats');
  expect(discard).toHaveBeenCalledTimes(2);
});

it('asks before switching away from an unsaved review week', async () => {
  const ui = mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '上一周复盘' }));
  await waitFor(() => expect(ui.confirm).toHaveBeenCalledOnce());
  expect(screen.getByRole('textbox')).toHaveValue('草稿');
  vi.mocked(ui.confirm).mockResolvedValueOnce(true);
  fireEvent.click(screen.getByRole('button', { name: '上一周复盘' }));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  expect(document.querySelector('form')?.dataset.unsaved).toBeUndefined();
});

it('clears the guard only after the review has been written successfully', async () => {
  mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '本周复习完成' } });
  fireEvent.click(screen.getByRole('button', { name: '保存复盘' }));
  await waitFor(() => expect(document.querySelector('form')?.dataset.unsaved).toBeUndefined());
  expect((await db.reviews.toArray())[0]?.note).toBe('本周复习完成');
  const discard = vi.fn();
  await handleNativeBack(discard);
  expect(discard).not.toHaveBeenCalled();
  expect(location.hash).toBe('#/stats');
});
