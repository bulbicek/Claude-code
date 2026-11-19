package sk.lgremote.pages;

import android.app.Activity;
import android.view.View;

/** Jedna stranka ovladaca. Appka ich listuje prstom zlava doprava. */
public interface RemotePage {

    /** Nazov v zahlavi. */
    String title();

    /** Kratky popis zariadenia pod nazvom. */
    String subtitle();

    /** Tmavy odtien pozadia, podla ktoreho sa stranka rozozna na prvy pohlad. */
    int background();

    /** Vytvori obsah stranky. */
    View create(Activity activity);

    /** Zavola sa, ked sa appka zatvara. */
    default void release() {
    }
}
