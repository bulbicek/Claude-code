.class public Lsk/ritvspanelaky/Bridge;
.super Ljava/lang/Object;
.implements Ljava/lang/Runnable;
.source "Bridge.java"

.field private act:Lsk/ritvspanelaky/MainActivity;
.field private on:Z

.method public constructor <init>(Lsk/ritvspanelaky/MainActivity;)V
    .registers 2
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lsk/ritvspanelaky/Bridge;->act:Lsk/ritvspanelaky/MainActivity;
    return-void
.end method

.method public setImmersive(Z)V
    .registers 3
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iput-boolean p1, p0, Lsk/ritvspanelaky/Bridge;->on:Z
    iget-object v0, p0, Lsk/ritvspanelaky/Bridge;->act:Lsk/ritvspanelaky/MainActivity;
    invoke-virtual {v0, p0}, Lsk/ritvspanelaky/MainActivity;->runOnUiThread(Ljava/lang/Runnable;)V
    return-void
.end method

.method public run()V
    .registers 3
    iget-object v0, p0, Lsk/ritvspanelaky/Bridge;->act:Lsk/ritvspanelaky/MainActivity;
    iget-boolean v1, p0, Lsk/ritvspanelaky/Bridge;->on:Z
    invoke-virtual {v0, v1}, Lsk/ritvspanelaky/MainActivity;->applyImmersive(Z)V
    return-void
.end method

.method public topInset()I
    .registers 5
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, Lsk/ritvspanelaky/Bridge;->act:Lsk/ritvspanelaky/MainActivity;
    invoke-virtual {v0}, Lsk/ritvspanelaky/MainActivity;->getResources()Landroid/content/res/Resources;
    move-result-object v0
    const-string v1, "status_bar_height"
    const-string v2, "dimen"
    const-string v3, "android"
    invoke-virtual {v0, v1, v2, v3}, Landroid/content/res/Resources;->getIdentifier(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)I
    move-result v1
    if-eqz v1, :zero
    invoke-virtual {v0, v1}, Landroid/content/res/Resources;->getDimensionPixelSize(I)I
    move-result v1
    invoke-virtual {v0}, Landroid/content/res/Resources;->getDisplayMetrics()Landroid/util/DisplayMetrics;
    move-result-object v2
    iget v2, v2, Landroid/util/DisplayMetrics;->density:F
    int-to-float v1, v1
    div-float/2addr v1, v2
    float-to-int v1, v1
    return v1
    :zero
    const/4 v1, 0x0
    return v1
.end method
