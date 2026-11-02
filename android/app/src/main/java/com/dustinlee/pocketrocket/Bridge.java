/*
 * Pocket Rocket Flight Lab
 * Copyright (C) 2026 Dustin Lee
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program. If not, see
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package com.dustinlee.pocketrocket;

import android.webkit.JavascriptInterface;

public class Bridge {
    final MainActivity activity;

    Bridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void saveFile(String name, String base64) {
        activity.save(name, base64);
    }

    // save a new design to a file the user picks, and remember that file for later saves
    @JavascriptInterface
    public void saveFileAsSource(String name, String base64) {
        activity.save(name, base64, true);
    }

    @JavascriptInterface
    public boolean saveToSource(String base64) {
        return activity.saveToSource(base64);
    }

    @JavascriptInterface
    public void markSource() {
        activity.markSource();
    }

    @JavascriptInterface
    public void clearSource() {
        activity.clearSource();
    }

    // the file the open design came from, so the recent-files list can open it again
    @JavascriptInterface
    public String getSource() {
        return activity.sourceUri == null ? "" : activity.sourceUri.toString();
    }

    // the current contents of a file opened before, or "" if it can't be read any more
    @JavascriptInterface
    public String readUri(String uri) {
        return activity.readUri(uri);
    }

    // a recent file was opened again: Save changes writes back into it
    @JavascriptInterface
    public void useSource(String uri) {
        activity.useSource(uri);
    }

    // the rocket was renamed: rename its file to match (returns the new file name, or "" if the file can't be renamed)
    @JavascriptInterface
    public String renameSource(String name) {
        return activity.renameSource(name);
    }

    // a large file (a video) sent in pieces, then saved where the user picks
    // a file shared to the app from another app, if one is waiting
    @JavascriptInterface
    public String takeIncoming() { return activity.takeIncoming(); }

    // open a location in the phone's map app (a geo: link), or a web link in the browser
    @JavascriptInterface
    public boolean openExternal(String uri) { return activity.openExternal(uri); }

    // a web request made for the page (the weather forecast), answered later through window.prFetchDone
    @JavascriptInterface
    public void fetchText(String id, String url) { activity.fetchText(id, url); }

    @JavascriptInterface
    public void beginFile(String name) { activity.beginFile(name); }

    @JavascriptInterface
    public void appendFile(String base64) { activity.appendFile(base64); }

    @JavascriptInterface
    public void finishFile() { activity.finishFile(); }
}
