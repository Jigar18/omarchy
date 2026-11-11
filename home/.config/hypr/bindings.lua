-- Keep only your personal keybinding overrides here. Add new bindings or
-- unbind defaults before replacing them.

-- See current bindings and descriptions:
--   omarchy menu keybindings --print

-- To disable every Omarchy default binding, set this in
-- ~/.config/hypr/hyprland.lua before require("default.hypr.omarchy"), then add
-- only the bindings you want below:
--   omarchy_default_bindings = false

-- To disable all preinstalled app/webapp bindings, set:
--   omarchy_preinstalled_bindings = false

-- Add a new binding.
-- o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")

-- This Vivobook uses HID LampArray. The stock WMI brightness path is inert.
hl.unbind("XF86KbdBrightnessUp")
hl.unbind("XF86KbdBrightnessDown")
hl.unbind("XF86KbdLightOnOff")
o.bind("XF86KbdBrightnessUp", "Keyboard brightness up", "omarchy-keyboard-lamp up", { locked = true, repeating = true })
o.bind("XF86KbdBrightnessDown", "Keyboard brightness down", "omarchy-keyboard-lamp down", { locked = true, repeating = true })
o.bind("XF86KbdLightOnOff", "Cycle keyboard backlight", "omarchy-keyboard-lamp cycle", { locked = true })
o.bind("SUPER + F7", "Cycle keyboard backlight", "omarchy-keyboard-lamp cycle")

-- Use the familiar screenshot shortcut for an interactive region capture.
hl.unbind("SUPER + SHIFT + S")
o.bind("SUPER + SHIFT + S", "Region screenshot", "omarchy capture screenshot region")

-- Change an existing binding by unbinding it first, then binding the key again.
-- This example changes SUPER+SPACE from the launcher to the Omarchy root menu.
-- hl.unbind("SUPER + SPACE")
-- o.bind("SUPER + SPACE", "Omarchy menu", "omarchy-menu toggle root")

-- Disable a default binding without replacing it.
-- hl.unbind("SUPER + SHIFT + B")

-- Logitech MX Keys examples:
-- o.bind("SUPER + SHIFT + S", nil, "omarchy-capture-screenshot")
-- o.bind("SUPER + H", nil, "voxtype record toggle")
-- o.bind("SUPER + PERIOD", nil, "omarchy-shell shell toggle omarchy.emojis")

-- Open or hide the resident notes window.
o.bind("SUPER + N", "Noty", "/home/jigark0/.local/bin/omarchy-notes toggle")
o.bind("SUPER + ALT + N", "New note", "/home/jigark0/.local/bin/omarchy-notes new")

-- Replace the default Calendar webapp with Claude Desktop.
hl.unbind("SUPER + SHIFT + C")
o.bind("SUPER + SHIFT + C", "Claude", { launch = "claude-desktop" })

-- Fn+F11 sends no keycode on this Vivobook, so toggle the touchpad from Super+F11.
o.bind_toggle("SUPER + F11", "Toggle touchpad", "touchpad", { locked = true })

-- Dictation keys from before Alt + Space and Right Alt became the defaults.
-- Remove these lines to give the keys back to applications.
if o.dictation_installed and o.dictation_installed() then
  o.bind("SUPER + CTRL + X", "Toggle dictation", "omarchy-dictation toggle")
  o.bind_hold("F9", "Start dictation (push-to-talk)", "omarchy-dictation start", "Stop dictation (push-to-talk)", "omarchy-dictation stop")
end
