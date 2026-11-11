-- Extra autostart processes.
-- o.launch_on_start("my-service")

-- Light the ASUS HID LampArray keyboard at its last-used brightness. Setting it
-- to 0% here leaves it black, and the firmware Fn+F4 control can't raise black.
o.exec_on_start("sleep 2 && vrgb restore")

-- Start Notes hidden so the bar and keyboard shortcut can open it instantly.
o.launch_on_start("/home/jigark0/.local/bin/omarchy-notes --background")
