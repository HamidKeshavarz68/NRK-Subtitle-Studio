package app.nrksubtitlestudio.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.IOException
import java.util.concurrent.TimeUnit

class HttpException(val code: Int, url: String) : IOException("HTTP $code for $url")

object Http {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun get(url: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url).apply { headers.forEach { (k, v) -> header(k, v) } }.build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw HttpException(res.code, url)
            res.body.string()
        }
    }

    suspend fun postForm(url: String, body: String, headers: Map<String, String> = emptyMap()): String =
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(url)
                .post(body.toRequestBody("application/x-www-form-urlencoded".toMediaType()))
                .apply { headers.forEach { (k, v) -> header(k, v) } }
                .build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) throw HttpException(res.code, url)
                res.body.string()
            }
        }

    suspend fun json(url: String): Any? = JSONTokener(get(url)).nextValue()
}

/* ------------------------------------------------- defensive JSON access */

/** Follow a dotted path through nested objects; null when anything is missing. */
fun Any?.at(path: String): Any? {
    if (path.isEmpty()) return this
    var cur: Any? = this
    for (key in path.split('.')) {
        val obj = cur as? JSONObject ?: return null
        cur = obj.opt(key)
        if (cur == null || cur == JSONObject.NULL) return null
    }
    return cur
}

fun Any?.str(path: String = ""): String = at(path) as? String ?: ""

fun Any?.num(path: String = ""): Double? = (at(path) as? Number)?.toDouble()

fun Any?.list(path: String = ""): List<Any?> {
    val a = at(path) as? JSONArray ?: return emptyList()
    return List(a.length()) { a.opt(it) }
}
