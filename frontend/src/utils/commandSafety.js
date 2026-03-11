export const DANGEROUS_MODES = ['MANUAL', 'ACRO', 'STABILIZE'];

export function isAirborne(telemetry) {
  return telemetry.armed && telemetry.alt > 1.0;
}

/**
 * Returns null if no confirmation needed, or a dialog config object.
 * @param {string} command - 'disarm', 'mode:MANUAL', etc.
 * @param {object} telemetry - drone telemetry state
 * @returns {null|{variant, title, message, doubleConfirm}}
 */
export function getCommandConfirmation(command, telemetry) {
  if (!isAirborne(telemetry)) return null;

  if (command === 'disarm') {
    return {
      variant: 'danger',
      title: 'Disarm While Airborne',
      message: `Vehicle is armed at ${telemetry.alt.toFixed(1)}m altitude. Disarming will cause an uncontrolled descent.`,
      doubleConfirm: true,
    };
  }

  if (command.startsWith('mode:')) {
    const mode = command.slice(5);
    if (DANGEROUS_MODES.includes(mode)) {
      return {
        variant: 'warning',
        title: `Switch to ${mode}`,
        message: `${mode} removes autopilot assistance. You will have full manual control at ${telemetry.alt.toFixed(1)}m altitude.`,
        doubleConfirm: false,
      };
    }
  }

  return null;
}
