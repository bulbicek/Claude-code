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
