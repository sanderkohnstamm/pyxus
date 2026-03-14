const videoSlice = (set) => ({
  // Video
  videoUrl: '',
  videoActive: false,

  // Video actions
  setVideoUrl: (url) => set({ videoUrl: url }),
  setVideoActive: (active) => set({ videoActive: active }),
});

export default videoSlice;
