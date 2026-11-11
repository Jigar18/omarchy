import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "jigark0.ram"

  property string usedMemory: "—G"
  property real iconNumberGap: Style.spaceReal(9)
  property real monitorGap: Style.spaceReal(5)

  implicitWidth: button.implicitWidth + monitorGap
  implicitHeight: button.implicitHeight

  function refresh() {
    if (!memoryProcess.running) memoryProcess.running = true
  }

  Process {
    id: memoryProcess
    running: false
    command: [
      "awk",
      "/^MemTotal:/{total=$2} /^MemAvailable:/{available=$2} END{printf \"%.1f\", (total-available)/1048576}",
      "/proc/meminfo"
    ]

    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var value = String(text || "").trim()
        if (/^[0-9]+(?:\.[0-9]+)?$/.test(value)) root.usedMemory = value + "G"
      }
    }
  }

  Timer {
    interval: 2000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Omarchy 4.5 shrinks BarIconButton's iconComponent to icon size, so the
  // icon and value are drawn as plain text beside each other instead.
  WidgetButton {
    id: button
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    height: parent.height
    bar: root.bar
    fontSize: Style.bar.iconFont
    labelVisible: false
    hasVisualContent: true
    fixedWidth: vertical ? -1 : Math.max(Style.bar.iconSlot * 2, ramContent.width + Style.spaceReal(8))
    tooltipText: "Open btop"

    Item {
      id: ramContent
      anchors.centerIn: parent
      scale: button.pressScale
      width: cpuIcon.implicitWidth + root.iconNumberGap + ramValue.implicitWidth
      height: parent.height

      Text {
        id: cpuIcon
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: "󰍛"
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        renderType: Text.NativeRendering
      }

      // Centered on the digit height like BarIconButton's label, so the value
      // lines up with the battery percentage instead of sitting higher.
      Text {
        id: ramValue
        anchors.left: cpuIcon.right
        anchors.leftMargin: root.iconNumberGap
        y: (parent.height - height) / 2
          + (ramValueMetrics.descent - ramValueMetrics.ascent + ramValueMetrics.tightBoundingRect("0").height) / 2
        text: root.usedMemory
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        renderType: Text.NativeRendering
      }

      FontMetrics {
        id: ramValueMetrics
        font: ramValue.font
      }
    }

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton && root.bar)
        root.bar.run("omarchy-launch-or-focus-tui btop")
    }
  }
}
