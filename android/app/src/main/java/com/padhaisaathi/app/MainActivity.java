package com.padhaisaathi.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView mWebView;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Immersive Dark Fullscreen
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );
        getWindow().setStatusBarColor(0xFF100B14);
        getWindow().setNavigationBarColor(0xFF100B14);

        mWebView = new WebView(this);
        mWebView.setBackgroundColor(0xFF100B14); // Prevent any white flash
        setContentView(mWebView);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null) {
                    String lower = url.toLowerCase();
                    if (lower.contains("instagram.com") || lower.contains("facebook.com") ||
                        lower.contains("tiktok.com") || lower.contains("twitter.com") ||
                        lower.contains("x.com") || lower.contains("reddit.com") ||
                        lower.contains("netflix.com") || lower.contains("discord.com")) {
                        
                        new androidx.appcompat.app.AlertDialog.Builder(MainActivity.this)
                            .setTitle("🛡️ Guardian Shield: Access Blocked")
                            .setMessage("Access to this website is restricted during study hours by parent policy. Stay focused on your syllabus!")
                            .setPositiveButton("Back to Study", null)
                            .show();
                        return true;
                    }
                }
                view.loadUrl(url);
                return true;
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient());

        // Load local bundled self-contained offline asset
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
