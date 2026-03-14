//
//  ParamsView.swift
//  pyxios
//
//  Searchable parameter list with safety subset at top.
//

import SwiftUI

// MARK: - Safety Parameter Definitions

private struct SafetyParamDef {
    let name: String
    let desc: String
}

private let arduPilotSafetyParams: [SafetyParamDef] = [
    .init(name: "FS_THR_ENABLE", desc: "Throttle Failsafe — 0=Disabled, 1=RTL, 2=Land"),
    .init(name: "FS_THR_VALUE", desc: "Throttle FS PWM threshold"),
    .init(name: "FS_GCS_ENABLE", desc: "GCS Failsafe — 0=Disabled, 1=RTL, 2=Land"),
    .init(name: "FS_BATT_ENABLE", desc: "Battery Failsafe — 0=Disabled, 1=Land, 2=RTL"),
    .init(name: "FS_BATT_VOLTAGE", desc: "Battery failsafe voltage threshold"),
    .init(name: "FS_BATT_MAH", desc: "Battery failsafe mAh minimum"),
    .init(name: "RTL_ALT", desc: "Return altitude (cm)"),
    .init(name: "RTL_ALT_FINAL", desc: "RTL final loiter altitude (cm)"),
    .init(name: "FENCE_ENABLE", desc: "Fence — 0=Disabled, 1=Enabled"),
    .init(name: "FENCE_TYPE", desc: "Fence type — 1=Alt, 2=Circle, 3=Both, 4=Polygon"),
    .init(name: "FENCE_ALT_MAX", desc: "Fence max altitude (m)"),
    .init(name: "FENCE_RADIUS", desc: "Fence radius (m)"),
    .init(name: "FENCE_ACTION", desc: "Fence action — 0=Report, 1=RTL, 2=Land"),
    .init(name: "ARMING_CHECK", desc: "Arming checks — 1=All, 0=Disabled"),
]

private let px4SafetyParams: [SafetyParamDef] = [
    .init(name: "COM_DL_LOSS_T", desc: "Datalink loss timeout (s)"),
    .init(name: "NAV_DLL_ACT", desc: "Datalink loss action — 0=Disabled, 1=Loiter, 2=RTL, 3=Land"),
    .init(name: "NAV_RCL_ACT", desc: "RC loss action — 0=Disabled, 1=Loiter, 2=RTL, 3=Land"),
    .init(name: "COM_LOW_BAT_ACT", desc: "Low battery action — 0=None, 1=Warning, 2=RTL, 3=Land"),
    .init(name: "BAT_LOW_THR", desc: "Low battery threshold (0-1)"),
    .init(name: "BAT_CRIT_THR", desc: "Critical battery threshold (0-1)"),
    .init(name: "RTL_RETURN_ALT", desc: "RTL return altitude (m)"),
    .init(name: "RTL_DESCEND_ALT", desc: "RTL descend altitude (m)"),
    .init(name: "GF_ACTION", desc: "Geofence action — 0=None, 1=Warning, 2=Loiter, 3=RTL, 4=Land"),
    .init(name: "GF_MAX_HOR_DIST", desc: "Geofence max horizontal distance (m)"),
    .init(name: "GF_MAX_VER_DIST", desc: "Geofence max vertical distance (m)"),
    .init(name: "COM_ARM_WO_GPS", desc: "Arm without GPS — 0=Require, 1=Allow"),
    .init(name: "CBRK_IO_SAFETY", desc: "IO safety breaker — 22027=Disable safety switch"),
]

// MARK: - Params View

struct ParamsView: View {
    let droneManager: DroneManager
    @State private var searchText = ""
    @State private var editingParam: String?
    @State private var editValue: String = ""
    @State private var safetyExpanded = true

    private var allParams: [DroneParam] { droneManager.paramService.params }
    private var paramNames: Set<String> { Set(allParams.map(\.name)) }

    private var safetyDefs: [SafetyParamDef] {
        let defs = droneManager.state.isArdupilot ? arduPilotSafetyParams : px4SafetyParams
        return defs.filter { paramNames.contains($0.name) }
    }

    private var filteredParams: [DroneParam] {
        if searchText.isEmpty { return allParams }
        let query = searchText.lowercased()
        return allParams.filter { $0.name.lowercased().contains(query) }
    }

    private var isCriticalParam: (String) -> Bool {
        { name in
            let prefixes = ["BATT_", "FS_", "ARMING_", "MOT_", "INS_", "FENCE_"]
            return prefixes.contains(where: { name.hasPrefix($0) })
        }
    }

    var body: some View {
        Group {
            if droneManager.paramService.isLoadingParams {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading parameters...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if allParams.isEmpty {
                ContentUnavailableView {
                    Label("No Parameters", systemImage: "slider.horizontal.3")
                } description: {
                    Text("Tap refresh to fetch parameters from the vehicle.")
                } actions: {
                    Button("Fetch Parameters") {
                        droneManager.fetchAllParams()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan)
                }
            } else {
                paramList
            }
        }
        .navigationTitle("Parameters")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    droneManager.fetchAllParams()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(droneManager.paramService.isLoadingParams)
            }
        }
        .onAppear {
            if allParams.isEmpty && droneManager.state.connectionState.isConnected {
                droneManager.fetchAllParams()
            }
        }
    }

    // MARK: - Param List

    private var paramList: some View {
        List {
            // Count header
            Section {
                Text("\(allParams.count) parameters loaded")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Safety section (only when not searching)
            if searchText.isEmpty && !safetyDefs.isEmpty {
                safetySection
            }

            // All params
            ForEach(filteredParams) { param in
                paramRow(param)
            }
        }
        .searchable(text: $searchText, prompt: "Search parameters")
    }

    // MARK: - Safety Section

    private var safetySection: some View {
        Section {
            // Collapsible header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    safetyExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "shield.checkered")
                        .foregroundStyle(.orange)
                    Text("Safety")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.orange)
                    Text("(\(safetyDefs.count))")
                        .font(.caption)
                        .foregroundStyle(.orange.opacity(0.7))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(safetyExpanded ? 90 : 0))
                }
            }

            if safetyExpanded {
                ForEach(safetyDefs, id: \.name) { def in
                    if let param = allParams.first(where: { $0.name == def.name }) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(def.desc)
                                .font(.caption2)
                                .foregroundStyle(.orange.opacity(0.7))
                            paramRow(param)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Param Row

    private func paramRow(_ param: DroneParam) -> some View {
        let critical = isCriticalParam(param.name)

        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(param.name)
                    .font(.system(.caption, design: .monospaced))
                    .fontWeight(.medium)
                    .foregroundStyle(critical ? .orange : .primary)
                Text(param.isFloat ? "Float" : "Int")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if editingParam == param.name {
                editControls(param: param)
            } else {
                Button {
                    editingParam = param.name
                    editValue = param.value
                } label: {
                    Text(param.value)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.cyan)
                }
            }
        }
        .listRowBackground(
            critical ? Color.orange.opacity(0.05) : nil
        )
    }

    @ViewBuilder
    private func editControls(param: DroneParam) -> some View {
        TextField("value", text: $editValue)
            .font(.system(.body, design: .monospaced))
            .multilineTextAlignment(.trailing)
            .frame(width: 100)
            .padding(4)
            .background(Color(.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .onSubmit {
                droneManager.setParam(name: param.name, value: editValue)
                editingParam = nil
            }

        Button {
            editingParam = nil
        } label: {
            Image(systemName: "xmark.circle")
                .foregroundStyle(.secondary)
        }

        Button {
            droneManager.setParam(name: param.name, value: editValue)
            editingParam = nil
        } label: {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.cyan)
        }
    }
}
