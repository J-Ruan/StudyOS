let audio: AudioContext | undefined;
export function enableFocusSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* Browser audio is optional. */
  }
}
export function chime() {
  if (!audio) return;
  const oscillator = audio.createOscillator(),
    gain = audio.createGain();
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.8);
}
