import { useCallback, useEffect, useState } from 'react';

import { useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';

import { fetchUserSettings, updateUserSettings, type UserSettings } from './index';

/**
 * The signed-in person's settings row. `save` applies a change straight away (so toggles feel
 * instant) and puts it back, with a plain message, if the database says no.
 */
export function useUserSettings() {
  const { session, handleError } = useAuth();
  const toast = useToast();
  const me = session!.user.id;
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState<UserError | null>(null);

  const load = useCallback(() => {
    fetchUserSettings(me)
      .then((s) => {
        setSettings(s);
        setError(null);
      })
      .catch((e) => setError(handleError(e, 'settings')));
  }, [me, handleError]);

  useEffect(load, [load]);

  const save = useCallback(
    async (patch: Partial<UserSettings>) => {
      let before: UserSettings | null = null;
      setSettings((s) => {
        before = s;
        return s ? { ...s, ...patch } : s;
      });
      try {
        await updateUserSettings(me, patch);
      } catch (e) {
        setSettings(before);
        toast.show({ message: handleError(e, 'saveSettings').message, tone: 'danger' });
      }
    },
    [me, handleError, toast],
  );

  return { settings, error, reload: load, save };
}
