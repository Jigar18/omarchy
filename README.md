# Omarchy customization backup

Everything changed on top of a stock Omarchy install on this machine (ASUS Vivobook S 16 S5606MA, user `jigark0`).
It covers configs, keybindings, bar plugins, theme tweaks, scripts and system tweaks. It is meant to be reapplied by hand or by a Claude session after a reinstall.

Snapshot taken on Omarchy `4.5.0-3`, rc channel (`https://pkgs.omarchy.org/rc/$arch`).

## Layout

| Path | What it is |
|------|------------|
| `home/` | Mirrors `$HOME` (`home/.config/hypr` → `~/.config/hypr`) |
| `system/` | Mirrors `/` (`system/etc/tlp.conf` → `/etc/tlp.conf`) |
| `state/` | Lists and dumps, not files to copy (packages, enabled units, dconf, groups, system info) |
| `backup.sh` | Re-collects everything from the live system into this repo. Read-only on the system. |

To refresh the backup: run `./backup.sh`, review `git diff`, then commit.

## Restore playbook

Do this on a fresh Omarchy install, logged in as `jigark0`. Read each file before overwriting anything. Never edit `/usr/share/omarchy`.

1. **Match Omarchy.** Switch to the rc channel the same way the `[omarchy]` section of `system/etc/pacman.conf` does, then `omarchy update`. Compare against `state/system-info.txt`. Don't copy `pacman.conf` blindly; merge the `[omarchy]` server line and the `Include = /etc/pacman.d/openai-chatgpt.conf` repo.
2. **Packages.**
   - Repo packages: `omarchy pkg add $(cat state/packages-extra.txt)`. `omarchy`, `omarchy-keyring` and `omarchy-settings` are already installed. `chatgpt-bin` needs the repo from `system/etc/pacman.d/openai-chatgpt.conf` first.
   - AUR packages: `omarchy pkg aur add $(cat state/packages-aur.txt)`.
   - `mise install` picks up `~/.config/mise/config.toml` (bun).
   - `state/packages-all-explicit.txt` is the full list, for reference only.
3. **Home files.** `rsync -a home/ ~/`. Symlinks are kept as links. Some point into `/usr/share/omarchy`, so they only resolve on Omarchy.
4. **System files.** `sudo rsync -a --no-owner --no-group system/ /`, then `sudo chown -R root:root` on what was copied. Make `/usr/local/bin/*`, `/usr/local/sbin/*` and `/usr/local/libexec/*` executable.
5. **Hibernate (machine-specific).** `system/etc/limine-entry-tool.d/resume.conf` holds this machine's `resume=UUID=… resume_offset=…`. On a new install, recreate the swapfile and recompute both values: the UUID with `findmnt -no UUID -T /swap/swapfile`, the offset with `btrfs inspect-internal map-swapfile -r`. Then regenerate the boot entries (`sudo limine-update` or `limine-mkinitcpio`). Lid → suspend-then-hibernate after 60 min comes from `logind.conf.d` and `sleep.conf.d`.
6. **Groups and udev.** `sudo groupadd -f vrgb`, `sudo usermod -aG vrgb,docker jigark0` (see `state/user-groups.txt`), then `sudo udevadm control --reload && sudo udevadm trigger`.
7. **Services.** `systemctl --user daemon-reload`, then enable what is in `state/enabled-user-units.txt` and `state/enabled-system-units.txt`. Most of these are Omarchy defaults; the custom ones are:
   - System: `omarchy-keyboard-lamp-init.service`, `tlp.service`.
   - User: `omarchy-battery-refresh-rate`, `omarchy-power-profile`, `voxtype`, `owed`, `claude-refresh-saved-login.timer`.
   - Skip `jouled.service`; that is a custom app that is not in this repo.
8. **dconf.** `dconf load / < state/dconf.ini`.
9. **Themes.** Clone the rainynight theme into `~/.config/omarchy/themes/rainynight` from the URL in `state/system-info.txt`. Then `omarchy theme set "Last Horizon"` and `omarchy font set "JetBrainsMono Nerd Font"`. The `last-horizon` overlay and `themed/` templates are already in `home/`.
10. **App patches.** Reinstall `claude-desktop` and `chatgpt-bin` once the system files are in place. The pacman hooks in `system/etc/pacman.d/hooks` then re-apply the Claude Desktop tweaks and the ChatGPT wide-chat patch.
11. **Reload.** `hyprctl reload && hyprctl configerrors`, then `omarchy restart shell` and `omarchy restart terminal`.

## What is customized

- **Hyprland** (`home/.config/hypr`):
  - Keyboard-lamp brightness keys and SUPER+F7. SUPER+SHIFT+S region screenshot. SUPER+SHIFT+C opens Claude Desktop. SUPER+F11 toggles the touchpad.
  - Dictation on SUPER+CTRL+X, with F9 push-to-talk.
  - SUPER+N / SUPER+ALT+N open Omarchy Notes, which is not in this repo.
  - Input: natural scroll, touchpad sensitivity 0.40, 4-finger workspace gestures.
  - Look: gaps 2/4, rounding 8, full opacity.
  - Monitors: scale 1.25, HDMI-A-1 at scale 1. btop min-size window rule. `vrgb restore` on autostart.
- **Omarchy shell**: bar layout, idle times (screensaver 150 s, lock 300 s) and dock pins in `shell.json`. Custom bar plugins `jigark0.*`. Menu overrides in `extensions/` (nightlight, suspend-then-hibernate). Hooks in `hooks/*.d`. Branding.
- **Theme**: Last Horizon overlay, `themed/` templates, backgrounds.
- **Terminals**: Alacritty, foot, Ghostty and Kitty all use JetBrainsMono Nerd Font Mono at size 11. tmux, herdr and starship are configured.
- **Defaults**: agent is Codex, dictation is voxtype.
- **Scripts** in `home/.local/bin`:
  - Keyboard lamp, battery-based refresh rate, power profile, charging-based theme.
  - ChatGPT, T3 Code and Kimi launchers; `gh` wrapper; Chrome theme sync.
- **System**:
  - TLP with battery charge thresholds 79/80. vrgb udev rule and keyboard-lamp init service. SDDM autologin.
  - Limine config and resume. Lid suspend-then-hibernate.
  - `/usr/local/bin/mkinitcpio` wrapper. Claude Desktop and ChatGPT patch tooling.
- **Dev tools**: nvim, lazygit, lazydocker, git, VS Code and Cursor user settings/keybindings, Claude Code and Codex instructions/settings/skills.

## Not in this repo

- **Custom apps.** Omarchy Notes (binary, desktop entry, `jigark0.notes` plugin), Joule (`jouled`), Muse. The Hyprland bindings and autostart still reference `omarchy-notes`; they are harmless if it is missing.
- **Secrets.** `~/.ssh`, `~/.gnupg`, keyrings, Claude/Codex credentials (`~/.claude/.credentials.json`, `~/.claude/oauth-token`, `~/.codex/auth.json`), saved Wi-Fi passwords.
- **App data.** Browser profiles/extensions; Obsidian, Discord, JetBrains, Postman, pgAdmin, WPS and similar app state; Docker data and databases.
- **Large or regenerable items.** The rainynight theme clone (only its URL is kept). `~/Wallpapers` and `~/Pictures`. AppImages in `~/Applications`. The swapfile. Claude's synced skill, mods and plugins. Codex sessions and memories.
- **Omarchy-managed system files.** `fstab`, `mkinitcpio.conf`, snapper configs, ufw rules, PAM, CUPS.

## Hardware and path assumptions

- `vrgb`, the keyboard-lamp scripts and the udev rule target this laptop's HID LampArray keyboard.
- The touchpad device name, monitor scale and the HDMI-A-1 rule are specific to this setup.
- Several files hardcode `/home/jigark0`. Restore as the same username or fix the paths.
- `home/.config/git/config` contains the git name and email.
