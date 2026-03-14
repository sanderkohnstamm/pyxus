//
//  ParamsView.swift
//  pyxios
//
//  Searchable parameter list via MAVSDK Param plugin.
//

import SwiftUI

struct ParamsView: View {
    let droneManager: DroneManager
    @State private var searchText = ""
    @State private var editingParam: String?
    @State private var editValue: String = ""

    private var filteredParams: [DroneParam] {
        if searchText.isEmpty { return droneManager.params }
        let query = searchText.lowercased()
        return droneManager.params.filter { $0.name.lowercased().contains(query) }
    }

    var body: some View {
        Group {
            if droneManager.isLoadingParams {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading parameters...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if droneManager.params.isEmpty {
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
                List {
                    Section {
                        Text("\(droneManager.params.count) parameters loaded")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    ForEach(filteredParams) { param in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(param.name)
                                    .font(.system(.caption, design: .monospaced))
                                    .fontWeight(.medium)
                                Text(param.isFloat ? "Float" : "Int")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            if editingParam == param.name {
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
                    }
                }
                .searchable(text: $searchText, prompt: "Search parameters")
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
                .disabled(droneManager.isLoadingParams)
            }
        }
        .onAppear {
            if droneManager.params.isEmpty && droneManager.state.connectionState.isConnected {
                droneManager.fetchAllParams()
            }
        }
    }
}
