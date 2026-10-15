import { useTheme, type ThemeSetting } from '../hooks/useTheme';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';
import SegmentedControl from './ui/SegmentedControl';

export const THEME_LABELS: Record<ThemeSetting, string> = { light: 'Hell', dark: 'Dunkel', system: 'System' };

export default function ThemeSwitcher() {
  const { setting, setTheme } = useTheme();

  return (
    <SegmentedControl<ThemeSetting>
      label="Farbschema"
      size="sm"
      value={setting}
      onChange={setTheme}
      options={[
        { value: 'light', label: THEME_LABELS.light, icon: <SunIcon className="size-3.5" />, iconOnly: true },
        { value: 'dark', label: THEME_LABELS.dark, icon: <MoonIcon className="size-3.5" />, iconOnly: true },
        { value: 'system', label: THEME_LABELS.system, icon: <MonitorIcon className="size-3.5" />, iconOnly: true },
      ]}
    />
  );
}
