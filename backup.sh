#!/bin/bash
# Re-collect every Omarchy customization on this machine into this repo.
# Read-only on the system: it only copies files into ./home, ./system and ./state.
# Run it again whenever you change something, then commit.
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"
cd "$HOME"

excludes=(
  --exclude='*.bak' --exclude='*.bak.*' --exclude='*.bak-*' --exclude='*.backup'
  --exclude='*.before-*' --exclude='*.omarchy-upgrade-to-quattro.*' --exclude='.*.bak.*'
  --exclude='*.log' --exclude='*.lock' --exclude='session.json' --exclude='.config.toml.*'
  --exclude='__pycache__' --exclude='.git' --exclude='*.aether-legacy'
)

# Paths relative to $HOME. Custom apps (Omarchy Notes, Joule, Muse) are deliberately left out.
home_paths=(
  .bashrc .bash_profile .XCompose

  .config/hypr
  .config/omarchy/shell.json .config/omarchy/shell.toml
  .config/omarchy/defaults/agent .config/omarchy/defaults/dictation
  .config/omarchy/extensions .config/omarchy/hooks .config/omarchy/branding
  .config/omarchy/themed .config/omarchy/backgrounds
  .config/omarchy/themes/last-horizon
  .config/omarchy/plugins/jigark0.agents .config/omarchy/plugins/jigark0.audio
  .config/omarchy/plugins/jigark0.indicators .config/omarchy/plugins/jigark0.nightlight
  .config/omarchy/plugins/jigark0.power .config/omarchy/plugins/jigark0.ram
  .config/omarchy/plugins/jigark0.tray .config/omarchy/plugins/jigark0.weather
  .config/omarchy/plugins/jigark0.workspaces

  .config/alacritty .config/foot .config/ghostty .config/kitty
  .config/tmux .config/herdr/config.toml .config/btop/btop.conf
  .config/starship.toml .config/nvim .config/lazygit .config/lazydocker
  .config/git/config .config/fastfetch .config/imv .config/mpv
  .config/fcitx5/config .config/fcitx5/profile
  .config/environment.d .config/fontconfig .config/uwsm .config/autostart
  .config/pipewire .config/wireplumber .config/xdg-desktop-portal
  .config/gtk-3.0/bookmarks
  .config/mimeapps.list .config/hyprland-mimeapps.list .config/user-dirs.dirs
  .config/hyprland-preview-share-picker
  .config/brave-flags.conf .config/chrome-flags.conf .config/chromium-flags.conf
  .config/code-flags.conf .config/cursor-flags.conf .config/claude-desktop-flags.conf
  .config/claude-desktop-custom.css .config/claude-desktop-custom.js
  .config/voxtype/config.toml .config/vrgb/config.json .config/mise/config.toml
  .config/opencode/opencode.json .config/zed/themes .config/tensaku/config.toml
  .config/Omacom
  .config/systemd/user

  .config/Code/User/settings.json .config/Code/User/keybindings.json .config/Code/User/snippets
  .config/Cursor/User/settings.json .config/Cursor/User/keybindings.json .config/Cursor/User/snippets

  .local/bin/chatgpt .local/bin/chrome-theme .local/bin/claude-refresh-saved-login
  .local/bin/gh .local/bin/kimi .local/bin/t3code .local/bin/t3code-patch-asar
  .local/bin/omarchy-agent-usage-update-compat .local/bin/omarchy-battery-refresh-rate
  .local/bin/omarchy-charging-based-theme .local/bin/omarchy-keyboard-lamp
  .local/bin/omarchy-power-profile
  .local/lib/omarchy-agent-usage-compat
  .local/share/applications
  .local/state/omarchy/toggles .local/state/omarchy/defaults .local/state/omarchy/settings

  .claude/CLAUDE.md .claude/settings.json .claude/themes
  .claude/skills/diagnose-crash .claude/skills/frontend-design .claude/skills/omarchy
  .claude/skills/omarchy-app .claude/skills/scroll-craft
  .codex/AGENTS.md .codex/config.toml
)

# Desktop entries and units that belong to custom apps or are machine-generated.
home_excludes=(
  --exclude='.local/share/applications/mimeinfo.cache'
  --exclude='.local/share/applications/com.jigark0.OmarchyNotes.desktop'
  --exclude='.local/share/applications/app.joule.Joule.desktop'
  --exclude='.config/systemd/user/jouled.service'
  --exclude='.config/systemd/user/*/jouled.service'
)

rm -rf "$repo/home" "$repo/system" "$repo/state"
mkdir -p "$repo/home" "$repo/system" "$repo/state"

existing=()
for path in "${home_paths[@]}"; do
  [[ -e $path || -L $path ]] && existing+=("./$path") || echo "skip (missing): ~/$path"
done
rsync -aR "${excludes[@]}" "${home_excludes[@]}" "${existing[@]}" "$repo/home/"

system_paths=(
  /etc/default/limine
  /etc/limine-entry-tool.d/resume.conf
  /etc/systemd/logind.conf
  /etc/systemd/logind.conf.d/30-lid-suspend-then-hibernate.conf
  /etc/systemd/sleep.conf.d/30-hibernate-delay.conf
  /etc/systemd/system/omarchy-keyboard-lamp-init.service
  /etc/udev/rules.d/99-vrgb.rules
  /etc/tlp.conf
  /etc/sddm.conf.d/autologin.conf
  /etc/pacman.conf
  /etc/pacman.d/openai-chatgpt.conf
  /etc/default/chatgpt-bin
  /etc/pacman.d/hooks/chatgpt-wide-chat.hook
  /etc/pacman.d/hooks/claude-desktop-tweaks.hook
  /usr/local/bin/vrgb
  /usr/local/bin/mkinitcpio
  /usr/local/libexec/omarchy-keyboard-lamp-init
  /usr/local/sbin/chatgpt-wide-chat-patch
  /usr/local/lib/claude-desktop-tweaks
  /usr/local/share/wayland-sessions/omarchy.desktop
)
for path in "${system_paths[@]}"; do
  [[ -r $path ]] && rsync -aR --no-owner --no-group "$path" "$repo/system/" || echo "skip (unreadable): $path"
done

# Package lists: everything explicitly installed that Omarchy does not install by itself.
omarchy_lists=(/usr/share/omarchy/install/omarchy-{base,other,x86_64-only}.packages)
sed 's/#.*//' "${omarchy_lists[@]}" | tr -s ' \t' '\n' | grep -v '^$' | sort -u > /tmp/omarchy-base-packages.$$
pacman -Qqem | sort > "$repo/state/packages-aur.txt"
pacman -Qqe | sort | comm -23 - /tmp/omarchy-base-packages.$$ | comm -23 - "$repo/state/packages-aur.txt" > "$repo/state/packages-extra.txt"
rm -f /tmp/omarchy-base-packages.$$
pacman -Qqe | sort > "$repo/state/packages-all-explicit.txt"

systemctl list-unit-files --state=enabled --no-legend --no-pager | awk '{print $1}' > "$repo/state/enabled-system-units.txt"
systemctl --user list-unit-files --state=enabled --no-legend --no-pager | awk '{print $1}' > "$repo/state/enabled-user-units.txt"
dconf dump / > "$repo/state/dconf.ini" 2>/dev/null || true
id -nG > "$repo/state/user-groups.txt"

{
  echo "omarchy_version=$(omarchy version 2>/dev/null)"
  echo "theme=$(omarchy theme current 2>/dev/null)"
  echo "font=$(omarchy font current 2>/dev/null)"
  echo "kernel=$(uname -r)"
  echo "hostname=$(cat /etc/hostname 2>/dev/null)"
  echo "machine=$(cat /sys/class/dmi/id/sys_vendor /sys/class/dmi/id/product_name 2>/dev/null | tr '\n' ' ')"
  echo "omarchy_channel=$(grep -A1 '^\[omarchy\]' /etc/pacman.conf | grep -o 'https://[^ ]*')"
  echo "rainynight_theme_repo=$(git -C ~/.config/omarchy/themes/rainynight remote get-url origin 2>/dev/null)"
} > "$repo/state/system-info.txt"

echo "Backup collected into $repo"
