.class public Lsk/ritvspanelaky/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

.field private web:Landroid/webkit/WebView;

.field private immersive:Z

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 6
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lsk/ritvspanelaky/MainActivity;->web:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    const/4 v3, 0x0
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    const v3, -0xd4d6db
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setBackgroundColor(I)V
    new-instance v3, Lsk/ritvspanelaky/Bridge;
    invoke-direct {v3, p0}, Lsk/ritvspanelaky/Bridge;-><init>(Lsk/ritvspanelaky/MainActivity;)V
    const-string v1, "RitApp"
    invoke-virtual {v0, v3, v1}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V
    sget v3, Landroid/os/Build$VERSION;->SDK_INT:I
    const/16 v1, 0x1c
    if-lt v3, v1, :nocut
    invoke-virtual {p0}, Lsk/ritvspanelaky/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v1
    invoke-virtual {v1}, Landroid/view/Window;->getAttributes()Landroid/view/WindowManager$LayoutParams;
    move-result-object v3
    iput v2, v3, Landroid/view/WindowManager$LayoutParams;->layoutInDisplayCutoutMode:I
    invoke-virtual {v1, v3}, Landroid/view/Window;->setAttributes(Landroid/view/WindowManager$LayoutParams;)V
    :nocut
    invoke-virtual {p0, v0}, Lsk/ritvspanelaky/MainActivity;->setContentView(Landroid/view/View;)V
    invoke-virtual {p0}, Lsk/ritvspanelaky/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v1
    const/high16 v3, 0x4000000
    invoke-virtual {v1, v3}, Landroid/view/Window;->clearFlags(I)V
    const/high16 v3, -0x80000000
    invoke-virtual {v1, v3}, Landroid/view/Window;->addFlags(I)V
    const/4 v3, 0x0
    invoke-virtual {v1, v3}, Landroid/view/Window;->setStatusBarColor(I)V
    invoke-virtual {p0, v3}, Lsk/ritvspanelaky/MainActivity;->applyImmersive(Z)V
    const-string v1, "file:///android_asset/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void
.end method

.method protected onPause()V
    .registers 4
    iget-object v0, p0, Lsk/ritvspanelaky/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :skip
    const-string v1, "window.__appPause&&window.__appPause()"
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    invoke-virtual {v0}, Landroid/webkit/WebView;->pauseTimers()V
    :skip
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    return-void
.end method

.method protected onResume()V
    .registers 4
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, Lsk/ritvspanelaky/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :skip
    invoke-virtual {v0}, Landroid/webkit/WebView;->resumeTimers()V
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    const-string v1, "window.__appResume&&window.__appResume()"
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    :skip
    return-void
.end method

.method public onBackPressed()V
    .registers 2
    const/4 v0, 0x1
    invoke-virtual {p0, v0}, Lsk/ritvspanelaky/MainActivity;->moveTaskToBack(Z)Z
    return-void
.end method

.method protected onDestroy()V
    .registers 2
    iget-object v0, p0, Lsk/ritvspanelaky/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :skip
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    :skip
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method

.method public applyImmersive(Z)V
    .registers 4
    iput-boolean p1, p0, Lsk/ritvspanelaky/MainActivity;->immersive:Z
    invoke-virtual {p0}, Lsk/ritvspanelaky/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v0
    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0
    const/16 v1, 0x500
    if-eqz p1, :set
    const/16 v1, 0x1706
    :set
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V
    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .registers 3
    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V
    if-eqz p1, :done
    iget-boolean v0, p0, Lsk/ritvspanelaky/MainActivity;->immersive:Z
    if-eqz v0, :done
    invoke-virtual {p0, v0}, Lsk/ritvspanelaky/MainActivity;->applyImmersive(Z)V
    :done
    return-void
.end method
