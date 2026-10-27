package io.github.wakin61043.equilens

import org.junit.Assert.assertEquals
import org.junit.Test

// 示意模式的查詢鍵：結果必須與 EquiLens-App/tools/demo-keys.mjs（tests/demo-keys.test.mjs）和 iOS DemoServer.swift 相同
class DemoServerKeysTest {
    @Test
    fun sameKeysAsTheRecorder() {
        assertEquals(listOf("m/api/summary"), DemoServer.keys("m/api/summary", emptyList()))
        assertEquals(listOf("m/api/alerts"), DemoServer.keys("m/api/alerts", listOf("since" to "12")))
        assertEquals(listOf("m/api/heatmap?date=2026-10-16", "m/api/heatmap"), DemoServer.keys("m/api/heatmap", listOf("date" to "2026-10-16")))
        assertEquals(listOf("m/api/intraday?group=semi&id=2330", "m/api/intraday?id=2330"), DemoServer.keys("m/api/intraday", listOf("id" to "2330", "group" to "semi")))
        assertEquals(listOf("m/api/pattern?id=3324&pid=p1"), DemoServer.keys("m/api/pattern", listOf("pid" to "p1", "id" to "3324")))
        assertEquals(listOf("m/api/chart?id=2330&period=5m"), DemoServer.keys("m/api/chart", listOf("period" to "5m", "id" to "2330")))
        assertEquals(listOf("m/api/chipwatch/branches?q=凱基", "m/api/chipwatch/branches"), DemoServer.keys("m/api/chipwatch/branches", listOf("q" to "凱基")))
    }
}
