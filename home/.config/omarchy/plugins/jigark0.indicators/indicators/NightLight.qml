import QtQuick
import qs.Ui

BarIndicator {
  id: root

  // This is the user-owned night-light service, set to the softer 4500 K
  // temperature. Keep the bar icon and the clock menu on this one state.
  readonly property var nightlightService: bar?.shell?.serviceFor("jigark0.nightlight")

  active: nightlightService ? nightlightService.enabled : false
  activeText: "󰔎"
  inactiveText: "󰔎"
  activeTooltipText: "Day Light"
  inactiveTooltipText: "Night Light"

  function toggle() {
    if (root.nightlightService) root.nightlightService.setNightlight(!root.active)
  }

  onPressed: function() { root.toggle() }
}
