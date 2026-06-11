package com.jpalab.domain;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;

@Entity
@DiscriminatorValue("ALBUM")
public class Album extends Item {

    private String artist;

    protected Album() {
    }

    public Album(String name, int price, String artist) {
        super(name, price);
        this.artist = artist;
    }

    public String getArtist() {
        return artist;
    }

    @Override
    public String toString() {
        return "Album{id=" + getId() + ", name='" + getName() + "', artist='" + artist + "'}";
    }
}
