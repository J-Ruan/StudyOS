import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Modal, SaveForm } from '../src/components/ui';
import { UIContext, type UI } from '../src/lib/context';

const native = vi.hoisted(() => vi.fn(() => true));
vi.mock('../src/lib/native', () => ({
  isNativeApp: native,
  NATIVE_BACK_EVENT: 'studyos:native-back',
}));

beforeEach(() => native.mockReturnValue(true));
afterEach(cleanup);

function Harness({ close, notify = vi.fn() }: { close: () => void; notify?: (s: string) => void }) {
  const [confirmation, setConfirmation] = useState<{ resolve: (answer: boolean) => void }>();
  const ui: UI = {
    open: vi.fn(),
    close,
    notify,
    focus: vi.fn(),
    confirm: () => new Promise<boolean>((resolve) => setConfirmation({ resolve })),
  };
  return (
    <UIContext.Provider value={ui}>
      <Modal title="编辑任务" onClose={close}>
        <SaveForm onSave={async () => {}}>
          <input aria-label="标题" defaultValue="旧标题" />
        </SaveForm>
      </Modal>
      {confirmation && (
        <Modal
          title="放弃未保存的修改？"
          onClose={() => {
            confirmation.resolve(false);
            setConfirmation(undefined);
          }}
        >
          <button
            onClick={() => {
              confirmation.resolve(true);
              setConfirmation(undefined);
            }}
          >
            放弃修改
          </button>
          <button
            onClick={() => {
              confirmation.resolve(false);
              setConfirmation(undefined);
            }}
          >
            继续编辑
          </button>
        </Modal>
      )}
    </UIContext.Provider>
  );
}

function back() {
  const event = new Event('studyos:native-back', { cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

it('closes a pristine modal immediately on Android Back', () => {
  const close = vi.fn();
  render(<Harness close={close} />);
  expect(back().defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledOnce();
});

it('protects edits and gives Back priority to the confirmation above the editor', async () => {
  const close = vi.fn();
  render(<Harness close={close} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '新的学习任务' } });
  back();
  await screen.findByRole('dialog', { name: '放弃未保存的修改？' });
  expect(close).not.toHaveBeenCalled();
  expect(back().defaultPrevented).toBe(true);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: '放弃未保存的修改？' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('textbox')).toHaveValue('新的学习任务');
  back();
  fireEvent.click(await screen.findByRole('button', { name: '放弃修改' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('uses the same discard guard on the close button and backdrop', async () => {
  const close = vi.fn();
  render(<Harness close={close} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '修改' } });
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  fireEvent.click(await screen.findByRole('button', { name: '继续编辑' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '继续编辑' })).not.toBeInTheDocument(),
  );
  fireEvent.mouseDown(document.querySelector('.modal-backdrop')!);
  await screen.findByRole('dialog', { name: '放弃未保存的修改？' });
  expect(close).not.toHaveBeenCalled();
});

it('retains existing web close behavior', () => {
  native.mockReturnValue(false);
  const close = vi.fn();
  render(<Harness close={close} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '修改' } });
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog', { name: '放弃未保存的修改？' })).not.toBeInTheDocument();
});

it('marks page forms unsaved until successful saving and keeps failed edits', async () => {
  const save = vi.fn().mockRejectedValueOnce(Error('空间不足')).mockResolvedValueOnce(undefined);
  render(
    <SaveForm onSave={save}>
      <input aria-label="学期" />
    </SaveForm>,
  );
  const form = document.querySelector('form')!;
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '秋季' } });
  expect(form.dataset.unsaved).toBe('true');
  fireEvent.submit(form);
  expect(await screen.findByRole('alert')).toHaveTextContent('空间不足');
  expect(form.dataset.unsaved).toBe('true');
  fireEvent.submit(form);
  await waitFor(() => expect(form.dataset.unsaved).toBeUndefined());
});
