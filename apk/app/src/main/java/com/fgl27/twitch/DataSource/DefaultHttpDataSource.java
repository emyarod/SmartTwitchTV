/*
 * original files is from exoplayer source https://github.com/google/ExoPlayer
 *
 * This file works as DefaultHttpDataSource and ByteArrayDataSource
 * When isPlaylist == true it works as ByteArrayDataSource
 *
 * Copyright (C) 2016 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.fgl27.twitch.DataSource;

import android.net.Uri;
import android.text.TextUtils;

import androidx.annotation.Nullable;
import androidx.annotation.VisibleForTesting;

import com.google.android.exoplayer2.C;
import com.google.android.exoplayer2.upstream.BaseDataSource;
import com.google.android.exoplayer2.upstream.DataSourceException;
import com.google.android.exoplayer2.upstream.DataSpec;
import com.google.android.exoplayer2.upstream.DataSpec.HttpMethod;
import com.google.android.exoplayer2.upstream.HttpDataSource;
import com.google.android.exoplayer2.util.Assertions;
import com.google.android.exoplayer2.util.Util;
import com.google.common.base.Ascii;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.NoRouteToHostException;
import java.net.ProtocolException;
import java.net.URL;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

import static java.lang.Math.max;
import static java.lang.Math.min;

public class DefaultHttpDataSource extends BaseDataSource implements HttpDataSource {

    public static final class Factory implements HttpDataSource.Factory {

        private final RequestProperties defaultRequestProperties;

        @Nullable
        private String userAgent;
        private int connectTimeoutMs;
        private int readTimeoutMs;
        private boolean allowCrossProtocolRedirects;
        private Uri uri;
        private byte[] mainPlaylist;

        /**
         * Creates an instance.
         */
        public Factory() {
            defaultRequestProperties = new RequestProperties();
            connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MILLIS;
            readTimeoutMs = DEFAULT_READ_TIMEOUT_MILLIS;
        }

        /**
         * @deprecated Use {@link #setDefaultRequestProperties(Map)} instead.
         */
        @Deprecated
        @Override
        public final RequestProperties getDefaultRequestProperties() {
            return defaultRequestProperties;
        }

        @Override
        public final Factory setDefaultRequestProperties(Map<String, String> defaultRequestProperties) {
            this.defaultRequestProperties.clearAndSet(defaultRequestProperties);
            return this;
        }

        /**
         * Sets the user agent that will be used.
         *
         * <p>The default is {@code null}, which causes the default user agent of the underlying
         * platform to be used.
         *
         * @param userAgent The user agent that will be used, or {@code null} to use the default user
         *                  agent of the underlying platform.
         * @return This factory.
         */
        public Factory setUserAgent(@Nullable String userAgent) {
            this.userAgent = userAgent;
            return this;
        }

        /**
         * Sets the connect timeout, in milliseconds.
         *
         * <p>The default is {@link DefaultHttpDataSource#DEFAULT_CONNECT_TIMEOUT_MILLIS}.
         *
         * @param connectTimeoutMs The connect timeout, in milliseconds, that will be used.
         * @return This factory.
         */
        public Factory setConnectTimeoutMs(int connectTimeoutMs) {
            this.connectTimeoutMs = connectTimeoutMs;
            return this;
        }

        /**
         * Sets the read timeout, in milliseconds.
         *
         * <p>The default is {@link DefaultHttpDataSource#DEFAULT_READ_TIMEOUT_MILLIS}.
         *
         * @param readTimeoutMs The connect timeout, in milliseconds, that will be used.
         * @return This factory.
         */
        public Factory setReadTimeoutMs(int readTimeoutMs) {
            this.readTimeoutMs = readTimeoutMs;
            return this;
        }

        /**
         * Sets whether to allow cross protocol redirects.
         *
         * <p>The default is {@code false}.
         *
         * @param allowCrossProtocolRedirects Whether to allow cross protocol redirects.
         * @return This factory.
         */
        public Factory setAllowCrossProtocolRedirects(boolean allowCrossProtocolRedirects) {
            this.allowCrossProtocolRedirects = allowCrossProtocolRedirects;
            return this;
        }

        public Factory setMainPlaylistBytes(byte[] mainPlaylist) {
            this.mainPlaylist = mainPlaylist;
            return this;
        }

        public Factory setUri(Uri uri) {
            this.uri = uri;
            return this;
        }

        @Override
        public DefaultHttpDataSource createDataSource() {
            return new DefaultHttpDataSource(
                    userAgent,
                    connectTimeoutMs,
                    readTimeoutMs,
                    allowCrossProtocolRedirects,
                    defaultRequestProperties,
                    mainPlaylist,
                    uri);
        }
    }

    /**
     * The default connection timeout, in milliseconds.
     */
    private static final int DEFAULT_CONNECT_TIMEOUT_MILLIS = 8 * 1000;
    /**
     * The default read timeout, in milliseconds.
     */
    private static final int DEFAULT_READ_TIMEOUT_MILLIS = 8 * 1000;

    private static final String TAG = "STTV_DefaultHttpDataSource";
    private static final int MAX_REDIRECTS = 20; // Same limit as okhttp.
    private static final int HTTP_STATUS_TEMPORARY_REDIRECT = 307;
    private static final int HTTP_STATUS_PERMANENT_REDIRECT = 308;
    private static final long MAX_BYTES_TO_DRAIN = 2048;
    private static final Pattern CONTENT_RANGE_HEADER =
            Pattern.compile("^bytes (\\d+)-(\\d+)/(\\d+)$");
    private static final AtomicReference<byte[]> skipBufferReference = new AtomicReference<>();

    private final boolean allowCrossProtocolRedirects;
    private final int connectTimeoutMillis;
    private final int readTimeoutMillis;
    @Nullable
    private final String userAgent;
    @Nullable
    private final RequestProperties defaultRequestProperties;
    private final RequestProperties requestProperties;

    @Nullable
    private DataSpec dataSpec;
    @Nullable
    private HttpURLConnection connection;
    @Nullable
    private InputStream inputStream;
    private boolean opened;
    private int responseCode;

    private long bytesToSkip;
    private long bytesToRead;

    private long bytesSkipped;
    private long bytesRead;

    private final Uri uri;
    private final byte[] mainPlaylist;
    private boolean isPlaylist;
    private int readPosition;
    private int bytesRemaining;

    private DefaultHttpDataSource(
            @Nullable String userAgent,
            int connectTimeoutMillis,
            int readTimeoutMillis,
            boolean allowCrossProtocolRedirects,
            @Nullable RequestProperties defaultRequestProperties,
            byte[] mainPlaylist,
            Uri uri) {
        super(/* isNetwork= */ true);
        this.userAgent = userAgent;
        this.connectTimeoutMillis = connectTimeoutMillis;
        this.readTimeoutMillis = readTimeoutMillis;
        this.allowCrossProtocolRedirects = allowCrossProtocolRedirects;
        this.defaultRequestProperties = defaultRequestProperties;
        this.requestProperties = new RequestProperties();
        this.mainPlaylist = mainPlaylist;
        this.uri = uri;
    }

    @Override
    @Nullable
    public Uri getUri() {
        if (isPlaylist) return uri;
        return connection == null ? null : Uri.parse(connection.getURL().toString());
    }

    @Override
    public int getResponseCode() {
        return connection == null || responseCode <= 0 ? -1 : responseCode;
    }

    @Override
    public Map<String, List<String>> getResponseHeaders() {
        return connection == null ? Collections.emptyMap() : connection.getHeaderFields();
    }

    @Override
    public void setRequestProperty(String name, String value) {
        Assertions.checkNotNull(name);
        Assertions.checkNotNull(value);
        requestProperties.set(name, value);
    }

    @Override
    public void clearRequestProperty(String name) {
        Assertions.checkNotNull(name);
        requestProperties.remove(name);
    }

    @Override
    public void clearAllRequestProperties() {
        requestProperties.clear();
    }

    /**
     * Opens the source to read the specified data.
     */
    @Override
    public long open(DataSpec dataSpec) throws HttpDataSourceException {
        isPlaylist = dataSpec.uri.toString().equals(uri.toString()) && (mainPlaylist.length > 0);

        this.dataSpec = dataSpec;
        this.bytesRead = 0;
        this.bytesSkipped = 0;
        transferInitializing(dataSpec);

        if (isPlaylist) {

            readPosition = (int) dataSpec.position;
            bytesRemaining = (int) ((dataSpec.length == C.LENGTH_UNSET)
                    ? (mainPlaylist.length - dataSpec.position) : dataSpec.length);

            if (bytesRemaining <= 0 || readPosition + bytesRemaining > mainPlaylist.length) {
                throw new HttpDataSourceException("Unsatisfiable range: [" + readPosition + ", " + dataSpec.length
                        + "], length: " + mainPlaylist.length, dataSpec, HttpDataSourceException.TYPE_OPEN);
            }

            opened = true;
            transferStarted(dataSpec);
            return bytesRemaining;

        } else {
            try {
                connection = makeConnection(dataSpec);
            } catch (IOException e) {
                @Nullable String message = e.getMessage();
                if (message != null
                        && Ascii.toLowerCase(message).matches("cleartext http traffic.*not permitted.*")) {
                    throw new CleartextNotPermittedException(e, dataSpec);
                }
                throw new HttpDataSourceException(
                        "Unable to connect", e, dataSpec, HttpDataSourceException.TYPE_OPEN);
            }

            String responseMessage;
            try {
                responseCode = connection.getResponseCode();
                responseMessage = connection.getResponseMessage();
            } catch (IOException e) {
                closeConnectionQuietly();
                throw new HttpDataSourceException(
                        "Unable to connect", e, dataSpec, HttpDataSourceException.TYPE_OPEN);
            }

            // Check for a valid response code.
            if (responseCode < 200 || responseCode > 299) {
                Map<String, List<String>> headers = connection.getHeaderFields();
                @Nullable InputStream errorStream = connection.getErrorStream();
                byte[] errorResponseBody;
                try {
                    errorResponseBody =
                            errorStream != null ? Util.toByteArray(errorStream) : Util.EMPTY_BYTE_ARRAY;
                } catch (IOException e) {
                    errorResponseBody = Util.EMPTY_BYTE_ARRAY;
                }
                closeConnectionQuietly();
                InvalidResponseCodeException exception =
                        new InvalidResponseCodeException(
                                responseCode, responseMessage, headers, dataSpec, errorResponseBody);

                if (responseCode == 416) {
                    exception.initCause(new DataSourceException(DataSourceException.POSITION_OUT_OF_RANGE));
                }
                throw exception;
            }

            // If we requested a range starting from a non-zero position and received a 200 rather than a
            // 206, then the server does not support partial requests. We'll need to manually skip to the
            // requested position.
            bytesToSkip = responseCode == 200 && dataSpec.position != 0 ? dataSpec.position : 0;

            // Determine the length of the data to be read, after skipping.
            boolean isCompressed = isCompressed(connection);
            if (!isCompressed) {
                if (dataSpec.length != C.LENGTH_UNSET) {
                    bytesToRead = dataSpec.length;
                } else {
                    long contentLength = getContentLength(connection);
                    bytesToRead = contentLength != C.LENGTH_UNSET ? (contentLength - bytesToSkip)
                            : C.LENGTH_UNSET;
                }
            } else {
                // Gzip is enabled. If the server opts to use gzip then the content length in the response
                // will be that of the compressed data, which isn't what we want. Always use the dataSpec
                // length in this case.
                bytesToRead = dataSpec.length;
            }

            try {
                inputStream = connection.getInputStream();
                if (isCompressed) {
                    inputStream = new GZIPInputStream(inputStream);
                }
            } catch (IOException e) {
                closeConnectionQuietly();
                throw new HttpDataSourceException(e, dataSpec, HttpDataSourceException.TYPE_OPEN);
            }

            opened = true;
            transferStarted(dataSpec);

            return bytesToRead;
        }
    }

    @Override
    public int read(byte[] buffer, int offset, int readLength) throws HttpDataSourceException {
        if (isPlaylist) {
            if (readLength == 0) {
                return 0;
            } else if (bytesRemaining == 0) {
                return C.RESULT_END_OF_INPUT;
            }

            readLength = min(readLength, bytesRemaining);
            System.arraycopy(mainPlaylist, readPosition, buffer, offset, readLength);
            readPosition += readLength;
            bytesRemaining -= readLength;
            bytesTransferred(readLength);
            return readLength;
        } else {
            try {
                skipInternal();
                return readInternal(buffer, offset, readLength);
            } catch (IOException e) {
                throw new HttpDataSourceException(e, dataSpec, HttpDataSourceException.TYPE_READ);
            }
        }
    }

    @Override
    public void close() throws HttpDataSourceException {
        if (isPlaylist) {
            if (opened) {
                opened = false;
                transferEnded();
            }
        } else {
            try {
                if (inputStream != null) {
                    try {
                        inputStream.close();
                    } catch (IOException e) {
                        throw new HttpDataSourceException(e, dataSpec, HttpDataSourceException.TYPE_CLOSE);
                    }
                }
            } finally {
                inputStream = null;
                closeConnectionQuietly();
                if (opened) {
                    opened = false;
                    transferEnded();
                }
            }
        }
    }

    /**
     * Establishes a connection, following redirects to do so where permitted.
     */
    private HttpURLConnection makeConnection(DataSpec dataSpec) throws IOException {
        URL url = new URL(dataSpec.uri.toString());
        @HttpMethod int httpMethod = dataSpec.httpMethod;
        @Nullable byte[] httpBody = dataSpec.httpBody;
        long position = dataSpec.position;
        long length = dataSpec.length;
        boolean allowGzip = dataSpec.isFlagSet(DataSpec.FLAG_ALLOW_GZIP);

        if (!allowCrossProtocolRedirects) {
            // HttpURLConnection disallows cross-protocol redirects, but otherwise performs redirection
            // automatically. This is the behavior we want, so use it.
            return makeConnection(
                    url,
                    httpMethod,
                    httpBody,
                    position,
                    length,
                    allowGzip,
                    /* followRedirects= */ true,
                    dataSpec.httpRequestHeaders);
        }

        // We need to handle redirects ourselves to allow cross-protocol redirects.
        int redirectCount = 0;
        while (redirectCount++ <= MAX_REDIRECTS) {
            HttpURLConnection connection =
                    makeConnection(
                            url,
                            httpMethod,
                            httpBody,
                            position,
                            length,
                            allowGzip,
                            /* followRedirects= */ false,
                            dataSpec.httpRequestHeaders);
            int responseCode = connection.getResponseCode();
            String location = connection.getHeaderField("Location");
            if ((httpMethod == DataSpec.HTTP_METHOD_GET || httpMethod == DataSpec.HTTP_METHOD_HEAD)
                    && (responseCode == HttpURLConnection.HTTP_MULT_CHOICE
                    || responseCode == HttpURLConnection.HTTP_MOVED_PERM
                    || responseCode == HttpURLConnection.HTTP_MOVED_TEMP
                    || responseCode == HttpURLConnection.HTTP_SEE_OTHER
                    || responseCode == HTTP_STATUS_TEMPORARY_REDIRECT
                    || responseCode == HTTP_STATUS_PERMANENT_REDIRECT)) {
                connection.disconnect();
                url = handleRedirect(url, location);
            } else if (httpMethod == DataSpec.HTTP_METHOD_POST
                    && (responseCode == HttpURLConnection.HTTP_MULT_CHOICE
                    || responseCode == HttpURLConnection.HTTP_MOVED_PERM
                    || responseCode == HttpURLConnection.HTTP_MOVED_TEMP
                    || responseCode == HttpURLConnection.HTTP_SEE_OTHER)) {
                // POST request follows the redirect and is transformed into a GET request.
                connection.disconnect();
                httpMethod = DataSpec.HTTP_METHOD_GET;
                httpBody = null;
                url = handleRedirect(url, location);
            } else {
                return connection;
            }
        }

        // If we get here we've been redirected more times than are permitted.
        throw new NoRouteToHostException("Too many redirects: " + redirectCount);
    }

    /**
     * Configures a connection and opens it.
     *
     * @param url               The url to connect to.
     * @param httpMethod        The http method.
     * @param httpBody          The body data, or {@code null} if not required.
     * @param position          The byte offset of the requested data.
     * @param length            The length of the requested data, or {@link C#LENGTH_UNSET}.
     * @param allowGzip         Whether to allow the use of gzip.
     * @param followRedirects   Whether to follow redirects.
     * @param requestParameters parameters (HTTP headers) to include in request.
     */
    private HttpURLConnection makeConnection(
            URL url,
            @HttpMethod int httpMethod,
            @Nullable byte[] httpBody,
            long position,
            long length,
            boolean allowGzip,
            boolean followRedirects,
            Map<String, String> requestParameters)
            throws IOException {
        HttpURLConnection connection = openConnection(url);
        connection.setConnectTimeout(connectTimeoutMillis);
        connection.setReadTimeout(readTimeoutMillis);

        Map<String, String> requestHeaders = new HashMap<>();
        if (defaultRequestProperties != null) {
            requestHeaders.putAll(defaultRequestProperties.getSnapshot());
        }
        requestHeaders.putAll(requestProperties.getSnapshot());
        requestHeaders.putAll(requestParameters);

        for (Map.Entry<String, String> property : requestHeaders.entrySet()) {
            connection.setRequestProperty(property.getKey(), property.getValue());
        }

        if (!(position == 0 && length == C.LENGTH_UNSET)) {
            String rangeRequest = "bytes=" + position + "-";
            if (length != C.LENGTH_UNSET) {
                rangeRequest += (position + length - 1);
            }
            connection.setRequestProperty("Range", rangeRequest);
        }
        if (userAgent != null) {
            connection.setRequestProperty("User-Agent", userAgent);
        }
        connection.setRequestProperty("Accept-Encoding", allowGzip ? "gzip" : "identity");
        connection.setInstanceFollowRedirects(followRedirects);
        connection.setDoOutput(httpBody != null);
        connection.setRequestMethod(DataSpec.getStringForHttpMethod(httpMethod));

        if (httpBody != null) {
            connection.setFixedLengthStreamingMode(httpBody.length);
            connection.connect();
            OutputStream os = connection.getOutputStream();
            os.write(httpBody);
            os.close();
        } else {
            connection.connect();
        }
        return connection;
    }

    /**
     * Creates an {@link HttpURLConnection} that is connected with the {@code url}.
     */
    @VisibleForTesting
    /* package */
    HttpURLConnection openConnection(URL url) throws IOException {
        return (HttpURLConnection) url.openConnection();
    }

    /**
     * Handles a redirect.
     *
     * @param originalUrl The original URL.
     * @param location    The Location header in the response. May be {@code null}.
     * @return The next URL.
     * @throws IOException If redirection isn't possible.
     */
    private static URL handleRedirect(URL originalUrl, @Nullable String location) throws
            IOException {
        if (location == null) {
            throw new ProtocolException("Null location redirect");
        }
        // Form the new url.
        URL url = new URL(originalUrl, location);
        // Check that the protocol of the new url is supported.
        String protocol = url.getProtocol();
        if (!"https".equals(protocol) && !"http".equals(protocol)) {
            throw new ProtocolException("Unsupported protocol redirect: " + protocol);
        }
        // Currently this method is only called if allowCrossProtocolRedirects is true, and so the code
        // below isn't required. If we ever decide to handle redirects ourselves when cross-protocol
        // redirects are disabled, we'll need to uncomment this block of code.
        // if (!allowCrossProtocolRedirects && !protocol.equals(originalUrl.getProtocol())) {
        //   throw new ProtocolException("Disallowed cross-protocol redirect ("
        //       + originalUrl.getProtocol() + " to " + protocol + ")");
        // }
        return url;
    }

    /**
     * Attempts to extract the length of the content from the response headers of an open connection.
     *
     * @param connection The open connection.
     * @return The extracted length, or {@link C#LENGTH_UNSET}.
     */
    private static long getContentLength(HttpURLConnection connection) {
        long contentLength = C.LENGTH_UNSET;
        String contentLengthHeader = connection.getHeaderField("Content-Length");
        if (!TextUtils.isEmpty(contentLengthHeader)) {
            try {
                contentLength = Long.parseLong(contentLengthHeader);
            } catch (NumberFormatException ignored) {
                //Log.e(TAG, "Unexpected Content-Length [" + contentLengthHeader + "]");
            }
        }
        String contentRangeHeader = connection.getHeaderField("Content-Range");
        if (!TextUtils.isEmpty(contentRangeHeader)) {
            Matcher matcher = CONTENT_RANGE_HEADER.matcher(contentRangeHeader);
            if (matcher.find()) {
                try {
                    long contentLengthFromRange =
                            Long.parseLong(matcher.group(2)) - Long.parseLong(matcher.group(1)) + 1;
                    if (contentLength < 0) {
                        // Some proxy servers strip the Content-Length header. Fall back to the length
                        // calculated here in this case.
                        contentLength = contentLengthFromRange;
                    } else if (contentLength != contentLengthFromRange) {
                        // If there is a discrepancy between the Content-Length and Content-Range headers,
                        // assume the one with the larger value is correct. We have seen cases where carrier
                        // change one of them to reduce the size of a request, but it is unlikely anybody would
                        // increase it.
                        //Log.w(TAG, "Inconsistent headers [" + contentLengthHeader + "] [" + contentRangeHeader
                        //        + "]");
                        contentLength = max(contentLength, contentLengthFromRange);
                    }
                } catch (NumberFormatException ignored) {
                    //Log.e(TAG, "Unexpected Content-Range [" + contentRangeHeader + "]");
                }
            }
        }
        return contentLength;
    }

    /**
     * Skips any bytes that need skipping. Else does nothing.
     * <p>
     * This implementation is based roughly on {@code libcore.io.Streams.skipByReading()}.
     *
     * @throws InterruptedIOException If the thread is interrupted during the operation.
     * @throws EOFException           If the end of the input stream is reached before the bytes are skipped.
     */
    private void skipInternal() throws IOException {
        if (bytesSkipped == bytesToSkip) {
            return;
        }

        // Acquire the shared skip buffer.
        byte[] skipBuffer = skipBufferReference.getAndSet(null);
        if (skipBuffer == null) {
            skipBuffer = new byte[4096];
        }

        while (bytesSkipped != bytesToSkip) {
            int readLength = (int) min(bytesToSkip - bytesSkipped, skipBuffer.length);
            int read = inputStream.read(skipBuffer, 0, readLength);
            if (Thread.currentThread().isInterrupted()) {
                throw new InterruptedIOException();
            }
            if (read == -1) {
                throw new EOFException();
            }
            bytesSkipped += read;
            bytesTransferred(read);
        }

        // Release the shared skip buffer.
        skipBufferReference.set(skipBuffer);
    }

    /**
     * Reads up to {@code length} bytes of data and stores them into {@code buffer}, starting at
     * index {@code offset}.
     * <p>
     * This method blocks until at least one byte of data can be read, the end of the opened range is
     * detected, or an exception is thrown.
     *
     * @param buffer     The buffer into which the read data should be stored.
     * @param offset     The start offset into {@code buffer} at which data should be written.
     * @param readLength The maximum number of bytes to read.
     * @return The number of bytes read, or {@link C#RESULT_END_OF_INPUT} if the end of the opened
     * range is reached.
     * @throws IOException If an error occurs reading from the source.
     */
    private int readInternal(byte[] buffer, int offset, int readLength) throws IOException {
        if (readLength == 0) {
            return 0;
        }
        if (bytesToRead != C.LENGTH_UNSET) {
            long bytesRemaining = bytesToRead - bytesRead;
            if (bytesRemaining == 0) {
                return C.RESULT_END_OF_INPUT;
            }
            readLength = (int) min(readLength, bytesRemaining);
        }

        int read = inputStream.read(buffer, offset, readLength);
        if (read == -1) {
            if (bytesToRead != C.LENGTH_UNSET) {
                // End of stream reached having not read sufficient data.
                throw new EOFException();
            }
            return C.RESULT_END_OF_INPUT;
        }

        bytesRead += read;
        bytesTransferred(read);
        return read;
    }

    /**
     * Closes the current connection quietly, if there is one.
     */
    private void closeConnectionQuietly() {
        if (connection != null) {
            try {
                connection.disconnect();
            } catch (Exception ignored) {
                //Log.e(TAG, "Unexpected error while disconnecting", e);
            }
            connection = null;
        }
    }

    private static boolean isCompressed(HttpURLConnection connection) {
        String contentEncoding = connection.getHeaderField("Content-Encoding");
        return "gzip".equalsIgnoreCase(contentEncoding);
    }
}