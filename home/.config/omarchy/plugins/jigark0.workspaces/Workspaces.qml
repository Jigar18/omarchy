import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "omarchy.workspaces"

  function workspaceById(id) {
    var values = Hyprland.workspaces.values
    for (var i = 0; i < values.length; i++) {
      if (values[i].id === id) return values[i]
    }

    return null
  }

  // Since Omarchy 4.5 each monitor owns a block of ten workspaces (1-10, 11-20, ...),
  // so each bar shows its own monitor's block, labelled 1-0.
  readonly property int slots: 10

  readonly property var monitor: {
    var window = root.QsWindow.window
    var screen = window ? window.screen : null
    return screen ? Hyprland.monitorFor(screen) : Hyprland.focusedMonitor
  }
  readonly property string monitorName: root.monitor ? root.monitor.name : ""

  // Connector -> block, as written by Hyprland's monitor-workspaces script.
  property var blocks: ({})

  function readBlocks(text) {
    var next = {}
    var lines = String(text || "").split("\n")
    for (var i = 0; i < lines.length; i++) {
      var fields = lines[i].split("\t")
      if (fields.length >= 3 && fields[1] !== "") next[fields[1]] = parseInt(fields[0], 10)
    }
    root.blocks = next
  }

  FileView {
    path: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/omarchy/monitor-workspaces"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.readBlocks(text())
    onLoadFailed: root.readBlocks("")
  }

  function blockOf(id) {
    return Math.floor((id - 1) / root.slots)
  }

  function slotOf(id) {
    return (id - 1) % root.slots + 1
  }

  readonly property int activeWorkspaceId: root.monitor && root.monitor.activeWorkspace ? root.monitor.activeWorkspace.id : -1

  readonly property int block: {
    var block = root.blocks[root.monitorName]
    if (block !== undefined) return block
    return root.activeWorkspaceId > 0 ? root.blockOf(root.activeWorkspaceId) : 0
  }

  // The monitor's first five, any others of its own that exist, then workspaces
  // only visiting from an unplugged monitor.
  function workspaceIds() {
    var base = root.block * root.slots
    var ids = [base + 1, base + 2, base + 3, base + 4, base + 5]
    var guests = []
    var values = Hyprland.workspaces.values

    for (var i = 0; i < values.length; i++) {
      var id = values[i].id
      if (id <= 0) continue
      if (root.blockOf(id) === root.block) {
        if (ids.indexOf(id) === -1) ids.push(id)
      } else if (values[i].monitor && values[i].monitor.name === root.monitorName) {
        guests.push(id)
      }
    }

    ids.sort(function(left, right) { return left - right })
    guests.sort(function(left, right) { return left - right })
    return ids.concat(guests)
  }

  function focusWorkspace(id) {
    if (!root.bar) return
    var expression = root.blockOf(id) === root.block
      ? "o.workspaces.focus(" + root.slotOf(id) + ", \"" + root.monitorName + "\")"
      : "hl.dsp.focus({ workspace = \"" + id + "\" })"
    root.bar.run("hyprctl dispatch " + Util.shellQuote(expression))
  }

  // Quickshell credits every workspace switch to the focused monitor and misses
  // workspaces moved between monitors, so ask Hyprland for the real state.
  Connections {
    target: Hyprland
    function onRawEvent(event) {
      var name = event ? String(event.name) : ""
      var switched = name === "workspacev2" && root.monitor !== null && root.monitor.focused
      if (switched || name === "moveworkspacev2" || name === "changeworkspaceid") {
        Hyprland.refreshMonitors()
        Hyprland.refreshWorkspaces()
      }
    }
  }

  function windowIconSource(toplevel) {
    var fallback = Quickshell.iconPath("application-x-executable", true)
    var appId = toplevel.wayland ? toplevel.wayland.appId : ""
    if (!appId) return fallback

    // Window classes rarely match icon names directly; the desktop entry
    // (matched by id or StartupWMClass) carries the real icon.
    var entry = DesktopEntries.heuristicLookup(appId)
    var icon = entry && entry.icon ? entry.icon : appId
    if (icon.charAt(0) === "/") return Util.fileUrl(icon)

    return Quickshell.iconPath(icon, true) || fallback
  }

  readonly property real trailingGap: root.vertical ? 0 : Style.spaceReal(1.5)
  readonly property int iconSize: Style.space(12)
  readonly property color barBackground: root.bar ? root.bar.background : Color.background
  readonly property color barForeground: root.bar ? root.bar.barForeground : Color.foreground
  // The bar itself can be transparent, so the tile carries its own mostly
  // opaque fill, lifted slightly off the bar colour to stay visible on it.
  readonly property color occupiedTileColor: Util.alpha(Qt.tint(barBackground, Util.alpha(barForeground, 0.16)), 0.96)

  // The bar's natively rendered digits land about a pixel above the true
  // centre line; icons and tiles take the same lift so everything lines up.
  readonly property real digitLift: Style.spaceReal(1)

  implicitWidth: grid.implicitWidth + trailingGap
  implicitHeight: grid.implicitHeight

  GridLayout {
    id: grid
    anchors.fill: parent
    anchors.rightMargin: root.trailingGap
    columns: root.vertical ? 1 : root.workspaceIds().length
    columnSpacing: root.vertical ? 0 : Style.space(1)
    rowSpacing: root.vertical ? Style.space(2) : 0

    Repeater {
      model: root.workspaceIds()

      Item {
        id: workspaceSlot
        required property int modelData

        readonly property var workspace: root.workspaceById(modelData)
        readonly property var windows: workspace ? workspace.toplevels.values : []
        readonly property bool occupied: windows.length > 0
        // The workspace this bar's monitor is showing, whether or not that monitor has focus.
        readonly property bool focused: root.activeWorkspaceId === modelData
        readonly property int slot: root.slotOf(modelData)

        // Tile padding applies only to occupied workspaces; empty ones keep
        // the stock footprint. The number's slot already has slack around the
        // digit, so the left inset needs far less to read as half the right one.
        // The active circle is wider than a digit and gets a bit more room.
        readonly property real tileGap: occupied && !root.vertical ? Style.space(1) : 0
        readonly property real leftInset: occupied && !root.vertical ? Style.space(focused ? 3 : 2) : 0
        readonly property real rightInset: occupied && !root.vertical ? Style.space(12) : 0

        implicitWidth: root.vertical ? root.barSize : contents.implicitWidth + leftInset + rightInset + tileGap * 2
        implicitHeight: root.vertical ? contents.implicitHeight : root.barSize

        Rectangle {
          anchors.fill: parent
          anchors.leftMargin: workspaceSlot.tileGap
          anchors.rightMargin: workspaceSlot.tileGap
          anchors.topMargin: root.vertical ? 0 : Style.spaceReal(3) - root.digitLift
          anchors.bottomMargin: root.vertical ? 0 : Style.spaceReal(3) + root.digitLift
          radius: Style.space(4)
          color: root.occupiedTileColor
          opacity: workspaceSlot.occupied ? 1 : 0

          Behavior on opacity {
            NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
          }
        }

        Grid {
          id: contents
          anchors.verticalCenter: root.vertical ? undefined : parent.verticalCenter
          anchors.left: root.vertical ? undefined : parent.left
          anchors.leftMargin: workspaceSlot.tileGap + workspaceSlot.leftInset
          anchors.horizontalCenter: root.vertical ? parent.horizontalCenter : undefined
          columns: root.vertical ? 1 : workspaceSlot.windows.length + 1
          spacing: Style.space(4)
          horizontalItemAlignment: Grid.AlignHCenter
          verticalItemAlignment: Grid.AlignVCenter

          WidgetButton {
            bar: root.bar
            id: numberButton
            text: workspaceSlot.slot === root.slots ? "0" : String(workspaceSlot.slot)
            labelVisible: !workspaceSlot.focused
            opacity: workspaceSlot.occupied || workspaceSlot.focused ? 1 : 0.5
            interactive: false
            horizontalMargin: 6
            verticalPadding: 6
            fixedWidth: root.vertical ? root.barSize : Style.space(workspaceSlot.occupied ? 14 : 20)
            fixedHeight: root.vertical ? Style.space(20) : root.barSize

            // Drawn rather than a font glyph so it stays digit-sized and
            // centred at every display scale.
            Rectangle {
              visible: workspaceSlot.focused
              anchors.centerIn: parent
              anchors.verticalCenterOffset: -root.digitLift
              width: Style.space(9)
              height: width
              radius: width / 2
              color: numberButton.foreground
            }
          }

          Repeater {
            model: workspaceSlot.windows

            Image {
              required property var modelData

              width: root.iconSize
              height: root.iconSize
              fillMode: Image.PreserveAspectFit
              // Decode at physical pixels so icons stay sharp on HiDPI displays.
              sourceSize.width: Math.round(root.iconSize * Screen.devicePixelRatio)
              sourceSize.height: Math.round(root.iconSize * Screen.devicePixelRatio)
              source: root.windowIconSource(modelData)
              transform: Translate { y: -root.digitLift }
            }
          }
        }

        MouseArea {
          anchors.fill: parent
          cursorShape: Qt.PointingHandCursor
          onClicked: root.focusWorkspace(workspaceSlot.modelData)
        }
      }
    }
  }
}
