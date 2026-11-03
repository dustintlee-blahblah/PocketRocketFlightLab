/**
 * Saving the animation as a video (see the note below).
 */
/* ---------- video export: the animation rendered frame by frame, H.264 in an .mp4 ----------
   Frames are drawn off screen at 720×1280 and encoded with the browser's own H.264 encoder (WebCodecs);
   the .mp4 container is written here (a plain, "fast start" file: ftyp, moov, mdat). */
/**
 * Writes an .mp4 file from encoded H.264 frames.
 * @param {{width:number, height:number, fps:number, samples:{data:Uint8Array, key:boolean, pts:number}[],
 *   avcC:Uint8Array}} o frame size, frame rate, encoded frames (pts in µs) and the H.264 decoder configuration
 * @returns {Uint8Array}
 */
function mp4Mux({ width, height, fps, samples, avcC }) {
  const TS = fps * 1000,
    DUR = 1000; // timescale and per-frame duration
  const n = samples.length,
    total = n * DUR;
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255],
    u16 = (v) => [(v >> 8) & 255, v & 255],
    str = (t) => [...t].map((ch) => ch.charCodeAt(0));
  /**
   * An mp4 box: size, type, contents.
   */
  const box = (type, ...parts) => {
    const body = parts.flat(Infinity);
    return [...u32(8 + body.length), ...str(type), ...body];
  };
  /**
   * An mp4 full box (with version and flags).
   */
  const full = (type, ver, flags, ...parts) =>
    box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
  const matrix = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32);
  const keys = [];
  samples.forEach((sm, i) => {
    if (sm.key) keys.push(i + 1);
  });
  // composition offsets, only if the encoder reordered frames
  const offs = samples.map((sm, i) => Math.round(((sm.pts - (i * 1e6) / fps) * TS) / 1e6));
  const needCtts = offs.some((o) => o !== 0);
  /**
   * The movie header box, with the sample tables pointing at data from off.
   */
  const moov = (off) =>
    box(
      "moov",
      full(
        "mvhd",
        0,
        0,
        u32(0),
        u32(0),
        u32(TS),
        u32(total),
        u32(0x00010000),
        u16(0x0100),
        new Array(10).fill(0),
        matrix,
        new Array(24).fill(0),
        u32(2),
      ),
      box(
        "trak",
        full(
          "tkhd",
          0,
          3,
          u32(0),
          u32(0),
          u32(1),
          u32(0),
          u32(total),
          new Array(8).fill(0),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          matrix,
          u32(width * 65536),
          u32(height * 65536),
        ),
        box(
          "mdia",
          full("mdhd", 0, 0, u32(0), u32(0), u32(TS), u32(total), u16(0x55c4), u16(0)),
          full("hdlr", 0, 0, u32(0), str("vide"), new Array(12).fill(0), str("VideoHandler"), [0]),
          box(
            "minf",
            full("vmhd", 0, 1, new Array(8).fill(0)),
            box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
            box(
              "stbl",
              full(
                "stsd",
                0,
                0,
                u32(1),
                box(
                  "avc1",
                  new Array(6).fill(0),
                  u16(1),
                  u16(0),
                  u16(0),
                  new Array(12).fill(0),
                  u16(width),
                  u16(height),
                  u32(0x00480000),
                  u32(0x00480000),
                  u32(0),
                  u16(1),
                  new Array(32).fill(0),
                  u16(0x18),
                  u16(0xffff),
                  box("avcC", [...avcC]),
                ),
              ),
              full("stts", 0, 0, u32(1), u32(n), u32(DUR)),
              ...(needCtts
                ? [
                    full(
                      "ctts",
                      1,
                      0,
                      u32(n),
                      offs.map((o) => [...u32(1), ...u32(o >>> 0)]),
                    ),
                  ]
                : []),
              full("stss", 0, 0, u32(keys.length), keys.map(u32)),
              full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
              full(
                "stsz",
                0,
                0,
                u32(0),
                u32(n),
                samples.map((sm) => u32(sm.data.length)),
              ),
              full("stco", 0, 0, u32(1), u32(off)),
            ),
          ),
        ),
      ),
    );
  const ftyp = box("ftyp", str("isom"), u32(512), str("isom"), str("iso2"), str("avc1"), str("mp41"));
  const mlen = moov(0).length,
    dataLen = samples.reduce((a, sm) => a + sm.data.length, 0);
  const head = [...ftyp, ...moov(ftyp.length + mlen + 8), ...u32(8 + dataLen), ...str("mdat")];
  const outBuf = new Uint8Array(head.length + dataLen);
  outBuf.set(head, 0);
  let p = head.length;
  for (const sm of samples) {
    outBuf.set(sm.data, p);
    p += sm.data.length;
  }
  return outBuf;
}
/**
 * Video export state: busy, and whether the user cancelled.
 */
const VID = { busy: false, cancel: false };
/**
 * Renders the whole flight frame by frame, encodes it and saves the .mp4.
 */
async function animExportVideo() {
  if (VID.busy || !lastSim) return;
  const box = document.getElementById("animvidbox"),
    msg = document.getElementById("animvidmsg");
  /**
   * Shows the export's progress.
   */
  const say = (t) => {
    box.hidden = false;
    msg.textContent = t;
  };
  if (!window.VideoEncoder || !window.VideoFrame) {
    say("This device’s browser can’t make videos (it has no video encoder).");
    return;
  }
  if (!downloadsNS) {
    say("Saving files isn’t available in this view.");
    return;
  }
  const VW = 720,
    VH = 1280,
    fps = 30;
  let cfg = null;
  for (const codec of ["avc1.42001f", "avc1.42e01f", "avc1.4d001f", "avc1.4d0028", "avc1.640028"]) {
    for (const hw of ["prefer-hardware", "no-preference", "prefer-software"]) {
      const c = {
        codec,
        width: VW,
        height: VH,
        bitrate: 2500000,
        framerate: fps,
        hardwareAcceleration: hw,
        avc: { format: "avc" },
      };
      try {
        if ((await VideoEncoder.isConfigSupported(c)).supported) {
          cfg = c;
          break;
        }
      } catch (_) {}
    }
    if (cfg) break;
  }
  if (!cfg) {
    say("This device can’t encode H.264 video.");
    return;
  }
  VID.busy = true;
  VID.cancel = false;
  const btn = document.getElementById("animvideo");
  btn.disabled = true;
  const keep = { t: ANIM.t, cam: ANIM.cam, playing: ANIM.playing };
  animPlay(false);
  const cv = document.createElement("canvas");
  cv.width = VW;
  cv.height = VH;
  const c = cv.getContext("2d");
  c.setTransform(VW / 360, 0, 0, VH / 640, 0, 0);
  const samples = [];
  let avcC = null,
    err = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !avcC)
        avcC = new Uint8Array(meta.decoderConfig.description);
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      samples.push({ data: d, key: chunk.type === "key", pts: chunk.timestamp });
    },
    error: (e) => {
      err = e;
    },
  });
  try {
    enc.configure(cfg);
    const speed = ANIM.speed || 1,
      hold = 1.5,
      N = Math.ceil((ANIM.tEnd / speed + hold) * fps);
    ANIM.cam = null;
    for (let i = 0; i < N; i++) {
      if (VID.cancel) throw new Error("cancelled");
      if (err) throw err;
      ANIM.t = Math.min(ANIM.tEnd, (i / fps) * speed);
      c.setTransform(VW / 360, 0, 0, VH / 640, 0, 0);
      animDraw({ c, W: 360, H: 640 });
      const fr = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      enc.encode(fr, { keyFrame: i % (fps * 2) === 0 });
      fr.close();
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if (i % 15 === 0) {
        say(`Making the video… ${Math.round((i / N) * 100)}%`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    say("Finishing the video…");
    await enc.flush();
    if (err) throw err;
    enc.close();
    if (!avcC || !samples.length) throw new Error("the encoder returned no video");
    const mp4 = mp4Mux({ width: VW, height: VH, fps, samples, avcC });
    const base = (SOURCE && SOURCE.name ? SOURCE.name.replace(/\.(ork|rkt)$/i, "") : lastSim.D.name) || "rocket";
    const name =
      `${base}-${lastSim.m.cn || lastSim.m.name}-flight`
        .replace(/[^\w.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") + ".mp4";
    say("Saving the video…");
    if (isAndroidApp() && window.PocketRocketApp.beginFile) {
      // large files go to the app in pieces
      window.PocketRocketApp.beginFile(name);
      for (let o = 0; o < mp4.length; o += 393216)
        window.PocketRocketApp.appendFile(bufToB64(mp4.subarray(o, Math.min(o + 393216, mp4.length))));
      window.PocketRocketApp.finishFile();
      say(`Video ready: ${name}`);
    } else {
      const res = await downloadsNS.save({
        filename: name,
        data: mp4.buffer.slice(mp4.byteOffset, mp4.byteOffset + mp4.byteLength),
      });
      say(res.status === "saved" ? `Saved ${name}.` : "Choose where to save the video.");
    }
  } catch (e) {
    try {
      if (enc.state !== "closed") enc.close();
    } catch (_) {}
    const c2 = e && e.code;
    say(
      e && e.message === "cancelled"
        ? "Video cancelled."
        : c2 === "declined"
          ? "Save cancelled."
          : `Couldn’t make the video${e && e.message ? ": " + e.message : "."}`,
    );
  } finally {
    VID.busy = false;
    btn.disabled = false;
    ANIM.t = keep.t;
    ANIM.cam = keep.cam;
    document.getElementById("animvidcancel").textContent = "OK";
    if (ANIM.on) {
      animDraw();
      if (keep.playing) animPlay(true);
    }
  }
}
document.getElementById("animvideo").onclick = () => {
  document.getElementById("animvidcancel").textContent = "Cancel";
  animExportVideo();
};
document.getElementById("animvidcancel").onclick = () => {
  if (VID.busy) VID.cancel = true;
  else document.getElementById("animvidbox").hidden = true;
};
