package app.nrksubtitlestudio

import app.nrksubtitlestudio.data.DeepL
import app.nrksubtitlestudio.data.Nrk
import app.nrksubtitlestudio.data.Progress
import app.nrksubtitlestudio.data.SubtitleTrack
import app.nrksubtitlestudio.data.Vtt
import app.nrksubtitlestudio.data.formatBg
import app.nrksubtitlestudio.data.formatRate
import app.nrksubtitlestudio.data.isRtl
import app.nrksubtitlestudio.ui.formatTime
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VttTest {
    private val sample = """
        WEBVTT

        1
        00:00:01.000 --> 00:00:03.500 line:90%
        <i>Hei</i> &amp; velkommen!

        2
        00:01:02.25 --> 00:01:04.000
        To linjer
        her

        00:00:05.000 --> 00:00:06.000

    """.trimIndent()

    @Test fun parsesCuesStripsTagsAndEntities() {
        val cues = Vtt.parse(sample)
        assertEquals(2, cues.size)
        assertEquals(1.0, cues[0].start, 1e-9)
        assertEquals(3.5, cues[0].end, 1e-9)
        assertEquals("Hei & velkommen!", cues[0].text)
        assertEquals(62.25, cues[1].start, 1e-9)
        assertEquals("To linjer\nher", cues[1].text)
    }

    @Test fun indexAtFindsLastStartedCue() {
        val cues = Vtt.parse(sample)
        assertEquals(-1, Vtt.indexAt(cues, 0.5))
        assertEquals(0, Vtt.indexAt(cues, 1.0))
        assertEquals(0, Vtt.indexAt(cues, 30.0))
        assertEquals(1, Vtt.indexAt(cues, 100.0))
    }

    @Test fun hourTimestamps() {
        assertEquals(3723.5, Vtt.seconds("01:02:03.5"), 1e-9)
    }
}

class ProgressTest {
    @Test fun finishedRules() {
        assertTrue(Progress.isFinished(1800.0, 1858.0)) // less than a minute left
        assertFalse(Progress.isFinished(1700.0, 1858.0))
        assertTrue(Progress.isFinished(115.0, 120.0)) // 95 % of a short clip
        assertFalse(Progress.isFinished(80.0, 120.0)) // short clip: "a minute left" doesn't count
        assertFalse(Progress.isFinished(500.0, 0.0)) // unknown duration
    }

    @Test fun recordingKeepsEarlierPositionWhenPeeking() {
        val prev = Progress(600.0, 1800.0, false, 1)
        assertNull(Progress.next(prev, 10.0, 1800.0, 2))
        val n = Progress.next(prev, 900.7, 1800.0, 2)!!
        assertEquals(900.0, n.t, 0.0)
        assertFalse(n.done)
        assertTrue(Progress.next(prev, 1790.0, 1800.0, 3)!!.done)
        // Unknown duration falls back to the saved one.
        assertEquals(1800.0, Progress.next(prev, 700.0, 0.0, 4)!!.d, 0.0)
    }

    @Test fun resumeAndLabels() {
        assertEquals(0.0, Progress.resumePoint(null), 0.0)
        assertEquals(0.0, Progress.resumePoint(Progress(1800.0, 1800.0, true, 0)), 0.0)
        assertEquals(301.0, Progress.resumePoint(Progress(301.0, 1858.0, false, 0)), 0.0)
        assertEquals("✓ Watched", Progress.label(Progress(1.0, 1.0, true, 0)))
        assertEquals("26 min left", Progress.label(Progress(301.0, 1858.0, false, 0)))
        assertEquals("Started", Progress.label(Progress(400.0, 0.0, false, 0)))
    }
}

class DeepLTest {
    @Test fun targetsIncludePersianAndOthers() {
        assertEquals("FA", DeepL.target("fa"))
        assertEquals("KMR", DeepL.target("ku"))
        assertEquals("CKB", DeepL.target("ckb"))
        assertEquals("EN-US", DeepL.target("en"))
        assertNull(DeepL.target("so"))
        assertNull(DeepL.target("ti"))
    }

    @Test fun freeKeysUseFreeHost() {
        assertEquals("https://api-free.deepl.com/v2", DeepL.apiBase("abc:fx"))
        assertEquals("https://api.deepl.com/v2", DeepL.apiBase("abc"))
    }

    @Test fun rtl() {
        assertTrue(isRtl("fa"))
        assertTrue(isRtl("ar-EG"))
        assertFalse(isRtl("en"))
    }
}

class NrkTest {
    @Test fun pickStreamsSkipsDrmAndDetectsFormats() {
        val assets = JSONArray(
            """[
              {"url":"https://x/a/muxed.m3u8?adap=small","format":"HLS","encryptionScheme":"none"},
              {"url":"https://x/a/dash.mpd","format":"","mimeType":"application/dash+xml","encryptionScheme":"none"},
              {"url":"https://x/drm.mpd","format":"DASH","encryptionScheme":"cenc"},
              {"url":"https://x/live.m3u8","format":"HLS","encryptionScheme":"statickey"}
            ]""",
        )
        val streams = Nrk.pickStreams(List(assets.length()) { assets.get(it) })
        assertEquals(listOf("hls", "dash", "hls"), streams.map { it.format })
        assertFalse(streams.any { "drm" in it.url })
    }

    @Test fun pickImagePrefersClosestAtLeastWanted() {
        val list = JSONArray("""[{"url":"s","width":300},{"url":"m","width":640},{"url":"l","width":1920}]""")
        assertEquals("m", Nrk.pickImage(list, 600))
        assertEquals("l", Nrk.pickImage(list, 1600))
    }

    @Test fun durations() {
        assertEquals("1 t 19 min", Nrk.formatDuration("PT1H19M29S"))
        assertEquals("31 min", Nrk.formatDuration("PT30M45S"))
        assertEquals("", Nrk.formatDuration("bogus"))
    }

    @Test fun subtitleTrackPreference() {
        val a = SubtitleTrack("nb", "Norsk", "ttv", "a", false)
        val b = SubtitleTrack("nb", "Norsk", "nor", "b", false)
        val c = SubtitleTrack("nb", "Norsk", "ttv", "c", true)
        assertEquals("c", Nrk.pickSubtitleTrack(listOf(a, b, c))!!.url)
        assertEquals("b", Nrk.pickSubtitleTrack(listOf(a, b))!!.url)
        assertNull(Nrk.pickSubtitleTrack(emptyList()))
    }
}

class FormatTest {
    @Test fun rates() {
        assertEquals("0.9×", formatRate(0.9f))
        assertEquals("1×", formatRate(1f))
        assertEquals("1.05×", formatRate(1.05f))
        assertEquals("0.65×", formatRate(0.65f))
        assertEquals("0 %", formatBg(0))
        assertEquals("50 %", formatBg(50))
        assertEquals("100 %", formatBg(100))
    }

    @Test fun times() {
        assertEquals("0:05", formatTime(5.4))
        assertEquals("12:34", formatTime(754.0))
        assertEquals("1:02:03", formatTime(3723.0))
    }
}
